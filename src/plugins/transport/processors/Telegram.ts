import path = require( "path" );
import format = require( "string-format" );
import { Context as TContext } from "telegraf";
import * as TT from "typegram";
import winston = require( "winston" );

import type { TelegramFile, TelegramMessageHandler } from "@app/lib/handlers/TelegramMessageHandler";
import type { TransportConfig, TransportMessageStyle, TransportProcessor } from "@app/plugins/transport";

import { Context } from "@app/lib/handlers/Context";
import { parseUID } from "@app/lib/uidParser";
import { send, map as bridgeMap, truncate, defaultMessageStyle } from "@app/plugins/transport/bridge";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";
import delay from "@app/lib/delay";

export interface TransportTelegramOptions {
	notify: {
		join?: boolean;
		leave?: boolean;
		pin?: boolean;
	};

	/**
	 * 互聯頻道的內容
	 * 不接受對頻道的雙向轉發，原因是暫無方法檢測監聽到的頻道訊息是不是來自自己
	 *
	 * * out             -> 傳出頻道內容，如果無此選項此 plugin 不會監聽頻道發布訊息
	 * * out,must-review -> 同時檢查頻道是否有互聯出去，有的話進行單向不轉發防止無限迴圈
	 * * in              -> 傳入內容，僅做為標記供日後 tgApi 變更時使用
	 * * in,must-review  -> 同上
	 */
	channelTransport?: Record<string, "out" | "out,must-review" | "in" | "in,must-review">;

	/**
	 * 是否轉傳頻道內容
	 */
	forwardChannels?: boolean;

	/**
	 * 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）
	 */
	forwardCommands: boolean;

	/**
	 * 下面是其他群裡面互連機器人的名稱。在轉發這些機器人的訊息時，程式會嘗試從訊息中提取出真正的暱稱，
	 * 而不是顯示機器人的名稱。參數「[]」、「<>」指真正發訊息者暱稱兩邊的括號樣式，目前只支援這兩種括號。
	 */
	forwardBots: Record<string, "[]" | "<>">;

	/**
	 * 轉傳 Telegram Premium 專用版本的貼圖
	 */
	transportPremiumSticker?: boolean;
}

let config: TransportConfig;
let options: Partial<TransportTelegramOptions>;
let forwardBots: Record<string, "[]" | "<>" | "self"> = {};
let tgHandler: TelegramMessageHandler;
let messageStyle: TransportMessageStyle;

function htmlEscape( str: string ) {
	return str
		.replace( /&/gu, "&amp;" )
		.replace( /</gu, "&lt;" )
		.replace( />/gu, "&gt;" );
}

type FWDBotInfo =
	| { realNick: string; realText: string; }
	| { realNick: null; realText: null; };

// 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
function parseForwardBot( username: string, text: string ): FWDBotInfo {
	const symbol = forwardBots[ username ];
	if ( symbol === "self" ) {
		// TODO 更換匹配方式
		// [, , realNick, realText] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/mu) || [];
		const [ , realNick, realText ] = text.match( /^\[(.*?)\] ([^]*)$/mu ) ?? [];
		return { realNick, realText };
	} else if ( symbol === "[]" ) {
		const [ , realNick, realText ] = text.match( /^\[(.*?)\](?::? |\n)([^]*)$/mu ) ?? [];
		return { realNick, realText };
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if ( symbol === "<>" ) {
		const [ , realNick, realText ] = text.match( /^<(.*?)>(?::? |\n)([^]*)$/mu ) ?? [];
		return { realNick, realText };
	}

	return { realNick: null, realText: null };
}

function init( _tgHandler: TelegramMessageHandler, _config: TransportConfig ) {
	config = _config;
	options = config.options.Telegram ?? {};
	forwardBots = options.forwardBots ?? {};
	tgHandler = _tgHandler;
	messageStyle = config.options.messageStyle ?? defaultMessageStyle;

	if ( !options.notify ) {
		options.notify = {};
	}

	( async function () {
		while ( typeof tgHandler.username === "undefined" ) {
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
		if ( extra.reply?.username && extra.reply.username in forwardBots ) {
			const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
			if ( realNick ) {
				[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
			}
		} else if ( extra.forward?.username && extra.forward.username in forwardBots ) {
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
		const ctx = context._rawdata;

		// 檢查是不是在回覆互聯機器人
		if ( extra.reply?.username && extra.reply.username in forwardBots ) {
			const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
			if ( realNick ) {
				[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
			}
		} else if ( extra.forward?.username && extra.forward.username in forwardBots ) {
			const { realNick, realText } = parseForwardBot( extra.forward.username, context.text );
			if ( realNick ) {
				[ extra.forward.nick, context.text ] = [ realNick, realText ];
			}
		}

		if ( "sticker" in ctx.message && ctx.message.sticker.premium_animation && options.transportPremiumSticker ) {
			tgHandler.setFile( context, ctx.message.sticker.premium_animation, "sticker" );
		}

		send( context ).catch( function () {
			// ignore
		} );
	} );

	// Pinned message
	tgHandler.on( "group.pin", function ( info, ctx ) {
		if ( options.notify?.pin ) {
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

		if ( options.notify?.join ) {
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

		if ( options.notify?.leave ) {
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
			const key = parseUID( channel ).uid ?
				parseUID<true>( channel ).uid :
				Context.getUIDFromHandler( tgHandler, channel );

			if ( !key.match( /\/-?\d+$/ ) ) { // telegram/-123456789
				winston.warn( `[transport/processor/TG] Fail to mark channel "${ key }": You must provide channel id instead of provide channel username.` );
				continue;
			} else if ( !( key in bridgeMap ) ) {
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
						} catch ( err ) {
							winston.warn( `[transport/processor/TG] Fail to disable transport "${ c2 }" -> "${ key }": `, err );
						}
					}
				}
				listenChannel.push( +parseUID<true>( key ).id );
			} else if ( opt.includes( "in" ) ) {
				if ( opt.includes( "must-review" ) ) {
					for ( const c2 in bridgeMap[ key ] ) {
						try {
							bridgeMap[ key ][ c2 ].disabled = true;
						} catch ( err ) {
							winston.warn( `[transport/processor/TG] Fail to disable transport "${ key }" -> "${ c2 }": `, err );
						}
					}
				}
			}
		}
	}

	if ( listenChannel.length ) {
		listenChannel.forEach( function ( cid ) {
			tgHandler.getChat( cid )
				.then( function ( channel ) {
					if ( channel.type !== "channel" ) {
						listenChannel.splice( listenChannel.indexOf( cid ), 1 );
						winston.warn( `[transport/processor/TG] Unmark "${ cid }" as a channel: channel.type is ${ channel.type }.` );
						return;
					}

					if ( channel.linked_chat_id ) {
						const cUid = Context.getUIDFromHandler( tgHandler, cid );
						const gUid = Context.getUIDFromHandler( tgHandler, channel.linked_chat_id );
						if ( !( cUid in bridgeMap ) || !( gUid in bridgeMap[ cUid ] ) ) {
							return;
						}
						winston.debug( `[transport/processor/TG] disable transport "${ cUid }" -> "${ gUid }" (linked chat).` );
						bridgeMap[ cUid ][ gUid ].disabled = true;
					}
				} )
				.catch( function ( err ) {
					listenChannel.splice( listenChannel.indexOf( cid ), 1 );
					winston.warn( `[transport/processor/TG] Unmark "${ cid }" as a channel: Fail to fetch channel: `, err );
				} );
		} );

		tgHandler.on( "channel.post", function ( channel, msg, ctx ) {
			if ( !listenChannel.includes( channel.id ) ) {
				return;
			}

			const nick = `${ channel.title }${ "author_signature" in msg && msg.author_signature ? " (" + msg.author_signature + ")" : "" }`;

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

			if ( "reply_to_message" in msg && msg.reply_to_message ) {
				const reply: TT.ReplyMessage = msg.reply_to_message;
				context.extra.reply = {
					nick: tgHandler.getNick( reply.from ),
					username: reply.from?.username,
					message: tgHandler.convertToText( reply ),
					isText: "text" in reply && !!reply.text,
					id: String( reply.from?.id ),
					_rawdata: null
				};

				if (
					reply.from?.id === 777000 &&
					"forward_from_chat" in reply &&
					reply.forward_from_chat?.type === "channel"
				) {
					context.extra.reply.nick = `${ reply.forward_from_chat.title }${ "forward_signature" in reply && reply.forward_signature ? " (" + reply.forward_signature + ")" : "" }`;
					context.extra.reply.username = reply.forward_from_chat.username;
					context.extra.reply.id = reply.forward_from_chat.id;
				}
			} else if ( "forward_from" in msg && msg.forward_from ) {
				const fwd: TT.User = msg.forward_from;
				const fwdChat: TT.Chat | undefined = msg.forward_from_chat;
				if (
					fwd.id === 777000 &&
					fwdChat &&
					fwdChat.type === "channel"
				) {
					context.extra.forward = {
						nick: `${ fwdChat.title }${ "forward_signature" in msg && msg.forward_signature ? " (" + msg.forward_signature + ")" : "" }`,
						username: fwdChat.username
					};
				} else {
					context.extra.forward = {
						nick: tgHandler.getNick( fwd ),
						username: fwd.username
					};
				}
			}

			if ( "text" in msg ) {
				if ( !context.text ) {
					context.text = msg.text;
				}
			} else {
				if ( !tgHandler.parseMedia( context, msg ) ) {
					if ( "pinned_message" in msg ) {
						if ( options.notify?.pin ) {
							send( new BridgeMsg( {
								from: msg.chat.id,
								to: msg.chat.id,
								nick: nick,
								text: `Channel pinned: ${ tgHandler.convertToText( msg.pinned_message ).replace( /\n/gu, " " ) }`,
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
			}

			send( context ).catch( function () {
				// ignore
			} );
		} );
	}
}

// 收到了來自其他群組的訊息
async function receive( msg: BridgeMsg ) {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: `<b>${ htmlEscape( msg.nick ) }</b>`,
		from: htmlEscape( msg.from ),
		to: htmlEscape( msg.to ),
		text: htmlEscape( msg.text ),
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		client_short: htmlEscape( msg.extra.clientName?.shortname ?? msg.handler!.id ),
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		client_full: htmlEscape( msg.extra.clientName?.fullname ?? msg.handler!.type ),
		command: htmlEscape( msg.command ),
		param: htmlEscape( msg.param )
	};

	if ( msg.extra.reply ) {
		const reply = msg.extra.reply;
		meta.reply_nick = htmlEscape( reply.nick );
		if ( reply.username ) {
			meta.reply_user = reply.username;
		}
		if ( reply.isText ) {
			meta.reply_text = htmlEscape( truncate( reply.message ) );
		} else {
			meta.reply_text = reply.message;
		}
		meta.reply_text = htmlEscape( reply.message );
	}
	if ( msg.extra.forward ) {
		meta.forward_nick = htmlEscape( msg.extra.forward.nick );
		if ( msg.extra.forward.username ) {
			meta.forward_user = htmlEscape( msg.extra.forward.username );
		}
	}

	// 自定义消息样式
	let styleMode: "simple" | "complex" = "simple";
	if ( ( msg.extra.clients ?? 0 ) >= 3 && ( msg.extra.clientName?.shortname || msg.extra.isNotice ) ) {
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
		if ( msg.extra.files?.length ) {
			for ( const file of msg.extra.files ) {
				// eslint-disable-next-line @typescript-eslint/unbound-method
				const tgUploadCallback = ( file as TelegramFile ).tgUploadCallback;
				if ( typeof tgUploadCallback === "function" ) {
					await tgUploadCallback( msg, newRawMsg.message_id );
				}
			}
		}
	} else if ( msg.extra.uploads?.length ) {
		const replyOption = {
			reply_to_message_id: newRawMsg.message_id
		};

		for ( const upload of msg.extra.uploads ) {
			if ( upload.type === "audio" ) {
				await tgHandler.sendAudio( msg.to, upload.url, replyOption );
			} else if ( upload.type === "photo" ) {
				if ( path.extname( upload.url ) === ".gif" || path.extname( upload.url ) === ".mp4" ) {
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

export default {
	init,
	receive
} as TransportProcessor<"Telegram">;
