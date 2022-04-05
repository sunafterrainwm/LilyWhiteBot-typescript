/*
 * @name Discord 訊息收發
 */

import Discord = require( "discord.js" );
import LRU = require( "lru-cache" );
import format = require( "string-format" );
import winston = require( "winston" );

import type { DiscordMessageHandler } from "@app/src/lib/handlers/DiscordMessageHandler";
import type { TransportConfig, TransportProcessor } from "@app/src/plugins/transport";

import { send, truncate } from "@app/src/plugins/transport/bridge";
import { BridgeMsg } from "@app/src/plugins/transport/BridgeMsg";
import delay from "@app/src/lib/delay";

const userInfo = new LRU<string, Discord.User>( {
	max: 500,
	ttl: 3600000
} );

let config: TransportConfig;
let forwardBots: Record<string, "[]" | "<>" | "self"> = {};
let dcHandler: DiscordMessageHandler;

// 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
function parseForwardBot( id: string, text: string ) {
	let realText: string = null, realNick: string = null;
	const symbol = forwardBots[ id ];
	if ( symbol === "self" ) {
		// TODO 更換匹配方式
		// [, , realNick, realText] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/mu) || [];
		[ , realNick, realText ] = text.match( /^\[(.*?)\] ([^]*)$/mu ) || [];
	} else if ( symbol === "[]" ) {
		[ , realNick, realText ] = text.match( /^\[(.*?)\](?::? |\n)([^]*)$/mu ) || [];
	} else if ( symbol === "<>" ) {
		[ , realNick, realText ] = text.match( /^<(.*?)>(?::? |\n)([^]*)$/mu ) || [];
	}

	return { realNick, realText };
}

function init( _dcHandler: DiscordMessageHandler, _config: TransportConfig ) {
	config = _config;
	const options: Partial<TransportConfig[ "options" ][ "Discord" ]> = config.options.Discord || {};
	forwardBots = options.forwardBots || {};
	dcHandler = _dcHandler;

	// 我們自己也是傳話機器人
	( async function () {
		while ( dcHandler.me === undefined ) {
			await delay( 100 );
		}
		// 我們自己也是傳話機器人
		forwardBots[ dcHandler.me.id ] = "self";
	}() );

	/*
	 * 傳話
	 */
	// 將訊息加工好並發送給其他群組
	dcHandler.on( "channel.text", function ( context ) {
		function toSend() {
			send( context ).catch( function ( err ) {
				winston.error( "[transport/processor/DC] Uncaught Error:", err );
			} );
		}

		userInfo.set( String( context.from ), context._rawdata.author );

		const extra = context.extra;

		// 檢查是不是在回覆自己
		if ( extra.reply && forwardBots[ extra.reply.username ] === extra.reply.discriminator ) {
			const { realNick, realText } = parseForwardBot( String( extra.reply.id ), extra.reply.message );
			if ( realText ) {
				[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
			}
		}

		if ( /<a?:\w+:\d*?>/g.test( context.text ) ) {
			// 處理自定義表情符號
			const emojis: ( { name: string, id: string } )[] = [];
			const animated: ( { name: string, id: string } )[] = [];

			context.text = context.text.replace( /<:(\w+):(\d*?)>/g, function ( _, name: string, id: string ) {
				if ( id && !emojis.filter( function ( v ) {
					return v.id === id;
				} ).length ) {
					emojis.push( { name: name, id: id } );
				}
				return `<emoji: ${ name }>`;
			} );
			context.text = context.text.replace( /<a:(\w+):(\d*?)>/g, function ( _, name: string, id: string ) {
				if ( id && !animated.filter( function ( v ) {
					return v.id === id;
				} ).length ) {
					animated.push( { name: name, id: id } );
				}
				return `<emoji: ${ name }>`;
			} );

			if ( !context.extra.files ) {
				context.extra.files = [];
			}
			if ( dcHandler.relayEmoji ) {
				for ( const emoji of emojis ) {
					const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.png`;
					const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.png`;
					context.extra.files.push( {
						client: "Discord",
						type: "photo",
						id: emoji.id,
						size: 262144,
						url: dcHandler.useProxyURL ? proxyURL : url
					} );
				}
				for ( const emoji of animated ) {
					const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.gif`;
					const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.gif`;
					context.extra.files.push( {
						client: "Discord",
						type: "photo",
						id: emoji.id,
						size: 262144,
						url: dcHandler.useProxyURL ? proxyURL : url
					} );
				}
			}
			if ( !context.extra.files.length ) {
				delete context.extra.files;
			}
		}

		if ( /<@!?\d*?>/u.test( context.text ) ) {
			// 處理 at
			let ats: string[] = [];
			const promises: Promise<Discord.User | false>[] = [];

			context.text.replace( /<@!?(\d*?)>/gu, function ( all, id ) {
				ats.push( id );
				return all;
			} );
			ats = [ ...new Set( ats ) ];

			for ( const at of ats ) {
				if ( userInfo.has( at ) ) {
					promises.push( Promise.resolve( userInfo.get( at ) ) );
				} else {
					promises.push( dcHandler.fetchUser( at ).catch( function ( err ) {
						winston.error( `[transport/processor/DC] Fail to fetch user ${ at }`, err );
						return false;
					} ) );
				}
			}

			Promise.all( promises ).then(
				function ( infos ) {
					for ( const info of infos ) {
						if ( info ) {
							userInfo.set( info.id, info );
							context.text = context.text
								.replace(
									new RegExp( `<@!?${ info.id }>`, "gu" ),
									`@${ dcHandler.getNick( info ) }`
								);
						}
					}
				},
				function ( err ) {
					winston.error( "[transport/processor/DC] Uncaught Error:", err );
				}
			).finally( function () {
				toSend();
			} );
		} else {
			toSend();
		}
	} );
}

// 收到了來自其他群組的訊息
async function receive( msg: BridgeMsg ) {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: msg.nick,
		from: msg.from,
		to: msg.to,
		text: msg.text,
		client_short: msg.extra.clientName.shortname,
		client_full: msg.extra.clientName.fullname,
		command: msg.command,
		param: msg.param
	};
	if ( msg.extra.reply ) {
		const reply = msg.extra.reply;
		meta.reply_nick = reply.nick;
		meta.reply_user = reply.username;
		if ( reply.isText ) {
			meta.reply_text = truncate( reply.message );
		} else {
			meta.reply_text = reply.message;
		}
	}
	if ( msg.extra.forward ) {
		meta.forward_nick = msg.extra.forward.nick;
		meta.forward_user = msg.extra.forward.username;
	}

	// 自定义消息样式
	const messageStyle = config.options.messageStyle;
	let styleMode = "simple";
	if ( msg.extra.clients >= 3 && ( msg.extra.clientName.shortname || msg.extra.isNotice ) ) {
		styleMode = "complex";
	}

	let template: string;
	if ( msg.extra.isNotice ) {
		template = messageStyle[ styleMode ].notice;
	} else if ( msg.extra.isAction ) {
		template = messageStyle[ styleMode ].action;
	} else if ( msg.extra.reply ) {
		template = messageStyle[ styleMode ].reply;
	} else if ( msg.extra.forward ) {
		template = messageStyle[ styleMode ].forward;
	} else {
		template = messageStyle[ styleMode ].message;
	}

	const output = format( template, meta );
	const attachFileUrls = ( msg.extra.uploads || [] ).map( ( u ) => ` ${ u.url }` ).join( "" );
	dcHandler.say( msg.to, `${ output }${ attachFileUrls }` );
}

export = {
	init,
	receive
} as TransportProcessor<"Discord">;
