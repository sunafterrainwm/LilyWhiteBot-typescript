import path = require( "path" );
import format = require( "string-format" );
import { Context as TContext } from "telegraf";
import * as TT from "typegram";

import type { TelegramMessageHandler } from "@app/lib/handlers/TelegramMessageHandler";
import type { TransportConfig, TransportProcessor } from "@app/plugins/transport";

import { send, map as bridgeMap, truncate } from "@app/plugins/transport/bridge";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";
import delay from "@app/lib/delay";
import winston = require( "winston" );

function htmlEscape( str: string ) {
	return str
		.replace( /&/gu, "&amp;" )
		.replace( /</gu, "&lt;" )
		.replace( />/gu, "&gt;" );
}

let config: TransportConfig;
let forwardBots: Record<string, "[]" | "<>" | "self"> = {};
let tgHandler: TelegramMessageHandler;

// 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
function parseForwardBot( username: string, text: string ) {
	let realText: string = null, realNick: string = null;
	const symbol = forwardBots[ username ];
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

function init( _tgHandler: TelegramMessageHandler, _config: TransportConfig ) {
	config = _config;
	const options: Partial<TransportConfig[ "options" ][ "Telegram" ]> = config.options.Telegram || {};
	forwardBots = options.forwardBots || {};
	tgHandler = _tgHandler;

	if ( !options.notify ) {
		options.notify = {};
	}

	( async function () {
		while ( tgHandler.username === undefined ) {
			await delay( 100 );
		}
		// 我們自己也是傳話機器人
		forwardBots[ tgHandler.username ] = "self";
	}() );

	// 將訊息加工好並發送給其他群組
	tgHandler.on( "group.text", function ( context ) {
		const extra = context.extra;
		if ( context.text.match( /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u ) && !options.forwardCommands ) {
			return;
		}

		// 檢查是不是自己在回覆自己，然後檢查是不是其他互聯機器人在說話
		if ( extra.reply && forwardBots[ extra.reply.username ] ) {
			const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
			if ( realNick ) {
				[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
			}
		} else if ( extra.forward && forwardBots[ extra.forward.username ] ) {
			const { realNick, realText } = parseForwardBot( extra.forward.username, context.text );
			if ( realNick ) {
				[ extra.forward.nick, context.text ] = [ realNick, realText ];
			}
		}

		send( context ).catch( function () {
			// ignore
		} );
	} );

	tgHandler.on( "group.richmessage", function ( context ) {
		const extra = context.extra;

		// 檢查是不是在回覆互聯機器人
		if ( extra.reply && forwardBots[ extra.reply.username ] ) {
			const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
			if ( realNick ) {
				[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
			}
		}

		send( context ).catch( function () {
			// ignore
		} );
	} );

	// Pinned message
	tgHandler.on( "group.pin", function ( info, ctx ) {
		if ( options.notify.pin ) {
			send( new BridgeMsg( {
				from: info.from.id,
				to: info.to,
				nick: info.from.nick,
				text: `${ info.from.nick } pinned: ${ info.text.replace( /\n/gu, " " ) }`,
				isNotice: true,
				handler: tgHandler,
				_rawdata: ctx
			} ) ).catch( function () {
				// ignore
			} );
		}
	} );

	/*
	 * 加入與離開
	 */
	tgHandler.on( "group.join", function ( group, from, target, ctx ) {
		let text: string;
		if ( from.id === target.id ) {
			text = `${ target.nick } 加入群組`;
		} else {
			text = `${ from.nick } 邀請 ${ target.nick } 加入群組`;
		}

		if ( options.notify.join ) {
			send( new BridgeMsg( {
				from: target.id,
				to: group,
				nick: target.nick,
				text: text,
				isNotice: true,
				handler: tgHandler,
				_rawdata: ctx
			} ) ).catch( function () {
				// ignore
			} );
		}
	} );

	tgHandler.on( "group.leave", function ( group, from, target, ctx ) {
		let text: string;
		if ( from.id === target.id ) {
			text = `${ target.nick } 離開群組`;
		} else {
			text = `${ target.nick } 被 ${ from.nick } 移出群組`;
		}

		if ( options.notify.leave ) {
			send( new BridgeMsg( {
				from: target.id,
				to: group,
				nick: target.nick,
				text: text,
				isNotice: true,
				handler: tgHandler,
				_rawdata: ctx
			} ) ).catch( function () {
				// ignore
			} );
		}
	} );

	if ( options.forwardChannels ) {
		tgHandler.on( "group.channel.text", function ( _channel, context ) {
			send( context ).catch( function () {
			// ignore
			} );
		} );

		tgHandler.on( "group.channel.richmessage", function ( _channel, context ) {
			send( context ).catch( function () {
			// ignore
			} );
		} );
	}

	const listenChannel: number[] = [];

	if ( options.channelTransport && Object.keys( options.channelTransport ).length ) {
		for ( const channel in options.channelTransport ) {
			const key = BridgeMsg.parseUID( channel ).uid ?
				BridgeMsg.parseUID( channel ).uid :
				BridgeMsg.getUIDFromHandler( tgHandler, channel );

			if ( !( key in bridgeMap ) ) {
				// eslint-disable-next-line max-len
				// winston.warn( `[transport/processor/TG] Fail to bind channelTransport on "${ channel }": key is undefined.` );
				continue;
			}

			const opt = options.channelTransport[ channel ].split( "," ).map( function ( s ) {
				return s.trim() as "out" | "in" | "must-review";
			} );

			if ( opt.includes( "out" ) ) {
				if ( opt.includes( "must-review" ) ) {
					for ( const c2 in bridgeMap[ key ] ) {
						try {
							bridgeMap[ c2 ][ key ].disabled = true;
						} catch ( e ) {
							winston.warn( `[transport/processor/TG] Fail to disable transport "${ c2 }" -> "${ key }": ${ e }` );
						}
					}
				}
				listenChannel.push( +BridgeMsg.parseUID( key ).id );
			}
		}
	}

	tgHandler.on( "channel.post", async function ( channel, msg, ctx ) {
		if ( !listenChannel.includes( channel.id ) ) {
			return;
		}

		const nick = "author_signature" in msg ? msg.author_signature : "Chaanel";

		const context: BridgeMsg<TContext> = new BridgeMsg<TContext>( {
			from: ctx.chat.id,
			to: ctx.chat.id,
			nick: nick,
			text: "",
			isPrivate: false,
			extra: {
				username: "username" in msg.chat ? msg.chat.username : ""
			},
			handler: tgHandler,
			_rawdata: ctx
		} );

		if ( "reply_to_message" in ctx.message ) {
			const reply: TT.ReplyMessage = ctx.message.reply_to_message;
			context.extra.reply = {
				nick: tgHandler.getNick( reply.from ),
				username: reply.from.username,
				message: tgHandler.convertToText( reply ),
				isText: "text" in reply && !!reply.text,
				id: String( reply.from.id ),
				_rawdata: null
			};

			if (
				reply.from.id === 777000 &&
				"forward_from_chat" in reply &&
				reply.forward_from_chat.type === "channel"
			) {
				context.extra.reply.nick = `Channel ${ reply.forward_from_chat.title }`;
				context.extra.reply.username = reply.forward_from_chat.username;
				context.extra.reply.id = reply.forward_from_chat.id;
			}
		} else if ( "forward_from" in ctx.message ) {
			const fwd: TT.User = ctx.message.forward_from;
			const fwdChat: TT.Chat = ctx.message.forward_from_chat;
			if (
				fwd.id === 777000 &&
				fwdChat &&
				fwdChat.type === "channel"
			) {
				context.extra.forward = {
					nick: `Channel ${ fwdChat.title }`,
					username: fwdChat.username
				};
			} else {
				context.extra.forward = {
					nick: tgHandler.getNick( fwd ),
					username: fwd.username
				};
			}
		}

		if ( "text" in ctx.message ) {
			if ( !context.text ) {
				context.text = ctx.message.text;
			}
		} else {
			const message: TT.Message = ctx.message;

			if ( !await tgHandler.parseMedia( context, message ) ) {
				if ( "pinned_message" in message ) {
					if ( options.notify.pin ) {
						send( new BridgeMsg( {
							from: msg.chat.id,
							to: msg.chat.id,
							nick: "author_signature" in msg ? msg.author_signature : "Chaanel",
							text: `${ nick } pinned: ${ tgHandler.convertToText( message.pinned_message ).replace( /\n/gu, " " ) }`,
							isNotice: true,
							handler: tgHandler,
							_rawdata: ctx
						} ) ).catch( function () {
							// ignore
						} );
					}
				}

				return;
			}

			send( context ).catch( function () {
				// ignore
			} );
		}
	} );
}

// 收到了來自其他群組的訊息
async function receive( msg: BridgeMsg ) {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: `<b>${ htmlEscape( msg.nick ) }</b>`,
		from: htmlEscape( msg.from ),
		to: htmlEscape( msg.to ),
		text: htmlEscape( msg.text ),
		client_short: htmlEscape( msg.extra.clientName.shortname ),
		client_full: htmlEscape( msg.extra.clientName.fullname ),
		command: htmlEscape( msg.command ),
		param: htmlEscape( msg.param )
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
	let styleMode = "simple";
	const messageStyle = config.options.messageStyle;
	if ( /* msg.extra.clients >= 3 && */( msg.extra.clientName.shortname || msg.extra.isNotice ) ) {
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

	template = htmlEscape( template );
	const output = format( template, meta );
	const newRawMsg = await tgHandler.sayWithHTML( msg.to, output );

	// 如果含有相片和音訊

	// 源文件來自 Telegram
	if ( msg.from_client === tgHandler.type ) {
		if ( msg.extra.files && msg.extra.files.length ) {
			for ( const file of msg.extra.files ) {
				if ( typeof file.tgUploadCallback === "function" ) {
					await file.tgUploadCallback( msg, newRawMsg.message_id );
				}
			}
		}
	} else if ( msg.extra.uploads && msg.extra.uploads.length ) {
		const replyOption = {
			reply_to_message_id: newRawMsg.message_id
		};

		for ( const upload of msg.extra.uploads ) {
			if ( upload.type === "audio" ) {
				await tgHandler.sendAudio( msg.to, upload.url, replyOption );
			} else if ( upload.type === "photo" ) {
				if ( path.extname( upload.url ) === ".gif" ) {
					await tgHandler.sendAnimation( msg.to, upload.url, replyOption );
				} else {
					await tgHandler.sendPhoto( msg.to, upload.url, replyOption );
				}
			} else {
				await tgHandler.sendDocument( msg.to, upload.url, replyOption );
			}
		}
	// 就算上傳失敗，如果源文件來自 Telegram ，依然上傳
	}
}

export = {
	init,
	receive
} as TransportProcessor<"Telegram">;
