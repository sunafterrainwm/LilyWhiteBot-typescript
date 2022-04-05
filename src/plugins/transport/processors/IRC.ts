/*
 * @name IRC 訊息收發
 */

import color = require( "irc-colors" );
import format = require( "string-format" );
// import winston = require( "winston" );

import type { IMessage } from "irc-upd";

import type { IRCMessageHandler } from "@app/src/lib/handlers/IRCMessageHandler";
import type { TransportConfig, TransportProcessor } from "@app/src/plugins/transport";

import { send, truncate, map as bridgeMap } from "@app/src/plugins/transport/bridge";
import { BridgeMsg } from "@app/src/plugins/transport/BridgeMsg";

let config: TransportConfig;
let icHandler: IRCMessageHandler;

function init( _icHandler: IRCMessageHandler, _config: TransportConfig ) {
	config = _config;
	const options: Partial<TransportConfig[ "options" ][ "IRC" ]> = config.options.IRC || {};
	icHandler = _icHandler;

	// 自動加頻道
	icHandler.once( "event.registered", function () {
		for ( const g in bridgeMap ) {
			const cl = BridgeMsg.parseUID( g );
			if ( cl.client === "IRC" ) {
				// eslint-disable-next-line max-len
				// winston.warn( `[transport/processor/IC] please set channel "${ cl.id }" to config.IRC.bot.channels, auto join by processors is deprecated.` );
				icHandler.join( cl.id );
			}
		}
	} );

	const colorize: Partial<TransportConfig[ "options" ][ "IRC" ][ "colorize" ]> = options.colorize || {};

	if ( !options.notify ) {
		options.notify = {};
	}

	icHandler.splitPrefix = "->";
	icHandler.splitPostfix = "->";
	if ( colorize.enabled && colorize.linesplit ) {
		icHandler.splitPrefix = color[ colorize.linesplit ]( icHandler.splitPrefix );
		icHandler.splitPostfix = color[ colorize.linesplit ]( icHandler.splitPostfix );
	}

	/*
	 * 傳話
	 */

	// 將訊息加工好並發送給其他群組
	icHandler.on( "channel.text", function ( context ) {
		send( context ).catch( function () {
			// ignore
		} );

		if ( !context.isPrivate ) { // 記錄使用者發言的時間與頻道
			if ( !userlist[ context.from ] ) {
				userlist[ context.from ] = {};
			}

			userlist[ context.from ][ String( context.to ).toLowerCase() ] = Date.now();
		}
	} );

	/*
	 * 頻道 Topic 變更
	 */
	icHandler.on( "channel.topic", function ( channel, topic, nick, message ) {
		if ( message.command === "TOPIC" && options.notify.topic ) {
			let text: string;
			if ( topic ) {
				text = `${ nick } 將頻道Topic設定為 ${ topic }`;
			} else {
				text = `${ nick } 取消了頻道的Topic`;
			}

			send( new BridgeMsg( {
				from: channel.toLowerCase(),
				to: channel.toLowerCase(),
				nick: nick,
				text: text,
				isNotice: true,
				handler: icHandler,
				_rawdata: message
			} ) ).catch( function () {
				// ignore
			} );
		}
	} );

	/*
	 * 監視加入/離開頻道
	 */
	const awaySpan = 1000 * options.notify.timeBeforeLeave;
	const userlist = {};

	icHandler.on( "channel.join", function ( channel, nick, message ) {
		if ( options.notify.join && nick !== icHandler.nick ) {
			send( new BridgeMsg( {
				from: channel.toLowerCase(),
				to: channel.toLowerCase(),
				nick: nick,
				text: `${ nick } 加入頻道`,
				isNotice: true,
				handler: icHandler,
				_rawdata: message
			} ) ).catch( function () {
				// ignore
			} );
		}
	} );

	function isActive( nick: string, channel: string ) {
		const now = Date.now();
		return userlist[ nick ] && userlist[ nick ][ channel ] &&
				awaySpan > 0 && ( now - userlist[ nick ][ channel ] <= awaySpan );
	}

	icHandler.on( "event.nick", function ( oldnick, newnick, _channels, rawdata ) {
		// 記錄使用者更名情況
		if ( userlist[ oldnick ] ) {
			userlist[ newnick ] = userlist[ oldnick ];
			delete userlist[ oldnick ];
		}

		const message = `${ oldnick } 更名為 ${ newnick }`;

		for ( const ch in icHandler.chans ) {
			const chan = ch.toLowerCase();

			if (
				( options.notify.rename === "all" || options.notify.rename === true ) ||
				( options.notify.rename === "onlyactive" && userlist[ newnick ] && userlist[ newnick ][ chan ] )
			) {
				send( new BridgeMsg( {
					from: chan,
					to: chan,
					nick: newnick,
					text: message,
					isNotice: true,
					handler: icHandler,
					_rawdata: rawdata
				} ) ).catch( function () {
					// ignore
				} );
			}
		}
	} );

	function leaveHandler( nick: string, chans: string[], action: string, reason: string, rawdata: IMessage ) {
		let message: string;
		if ( reason ) {
			message = `${ nick } 已${ action } (${ reason })`;
		} else {
			message = `${ nick } 已${ action }`;
		}

		for ( const ch in chans ) {
			const chan = ch.toLowerCase();
			if (
				( options.notify.rename === "all" || options.notify.rename === true ) ||
				( options.notify.rename === "onlyactive" && isActive( nick, chan ) )
			) {
				send( new BridgeMsg( {
					from: chan,
					to: chan,
					nick: nick,
					text: message,
					isNotice: true,
					handler: icHandler,
					_rawdata: rawdata
				} ) ).catch( function () {
					// ignore
				} );
			}

			if ( userlist[ nick ] ) {
				delete userlist[ nick ][ chan ];
			}
		}
	}

	icHandler.on( "event.quit", function ( nick, reason, _channels, message ) {
		leaveHandler( nick, Object.keys( icHandler.chans ), "離開IRC", reason, message );
	} );

	icHandler.on( "channel.part", function ( channel, nick, reason, message ) {
		leaveHandler( nick, [ channel ], "離開頻道", reason, message );
	} );

	icHandler.on( "channel.kick", function ( channel, nick, by, reason, message ) {
		leaveHandler( nick, [ channel ], `被 ${ by } 踢出頻道`, reason, message );
	} );

	icHandler.on( "event.kill", function ( nick, reason, _channels, message ) {
		leaveHandler( nick, Object.keys( icHandler.chans ), "被kill", reason, message );
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

	// 给消息上色
	let output: string;
	const colorize: TransportConfig[ "options" ][ "IRC" ][ "colorize" ] = config.options.IRC.colorize;
	if ( msg.extra.isAction ) {
		output = format( template, meta );
		if ( colorize && colorize.enabled && colorize.broadcast ) {
			output = color[ colorize.broadcast ]( output );
		}
	} else {
		if ( colorize && colorize.enabled ) {
			if ( colorize.client ) {
				meta.client_short = color[ colorize.client ]( meta.client_short );
				meta.client_full = color[ colorize.client ]( meta.client_full );
			}
			if ( colorize.nick ) {
				if ( colorize.nick === "colorful" ) {
					// hash
					const m = meta.nick.split( "" ).map( function ( x ) {
						return x.codePointAt( 0 );
					} ).reduce( function ( x, y ) {
						return x + y;
					} );
					const n = colorize.nickcolors.length;

					meta.nick = color[ colorize.nickcolors[ m % n ] ]( meta.nick );
				} else {
					meta.nick = color[ colorize.nick ]( meta.nick );
				}
			}
			if ( msg.extra.reply && colorize.replyto ) {
				meta.reply_nick = color[ colorize.replyto ]( meta.reply_nick );
			}
			if ( msg.extra.reply && colorize.repliedmessage ) {
				meta.reply_text = color[ colorize.repliedmessage ]( meta.reply_text );
			}
			if ( msg.extra.forward && colorize.fwdfrom ) {
				meta.forward_nick = color[ colorize.fwdfrom ]( meta.forward_nick );
			}
		}

		output = format( template, meta );

		// 檔案
		if ( msg.extra.uploads ) {
			output += msg.extra.uploads.map( ( u ) => ` ${ u.url }` ).join();
		}
	}

	await icHandler.say( msg.to, output );
}

export = {
	init,
	receive
} as TransportProcessor<"IRC">;
