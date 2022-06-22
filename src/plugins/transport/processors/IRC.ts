/*
 * @name IRC 訊息收發
 */

import color = require( "irc-colors" );
import format = require( "string-format" );
// import winston = require( "winston" );

import type { IMessage } from "irc-upd";

import type { IRCMessageHandler } from "@app/lib/handlers/IRCMessageHandler";
import type { TransportConfig, TransportMessageStyle, TransportProcessor } from "@app/plugins/transport";

import { parseUID } from "@app/lib/uidParser";
import { send, truncate, map as bridgeMap, defaultMessageStyle } from "@app/plugins/transport/bridge";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

export type IRCColor = ( "white" | "black" | "navy" | "green" | "red" | "brown" | "purple" | "olive" |
"yellow" | "lightgreen" | "teal" | "cyan" | "blue" | "pink" | "gray" | "silver" ) & color.ValidColors;

export interface NotifyOptions {
	/**
	 * 有人進入頻道是否在其他群發出提醒
	 */
	join?: boolean;

	/**
	 * 有人更名的話是否在其他群組發出提醒，可取
	 * 「"all"」、「true」（所有人都提醒）、「"onlyactive"」（只有說過話的人更名才提醒）、
	 * 「"none"」、「false」（不提醒）
	 */
	rename?: boolean | "all" | "onlyactive" | "none";

	/**
	 * 有人離開頻道的話是否在其他群組提醒，可取
	 * 「"all"」、「true」（所有人都提醒）、「"onlyactive"」（只有說過話的人更名才提醒）、
	 * 「"none"」、「false」（不提醒）
	 */
	leave?: boolean | "all" | "onlyactive" | "none";

	/**
	 * 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
	 */
	timeBeforeLeave?: number;

	/**
	 * 頻道更換 Topic 時是否提醒
	 */
	topic?: boolean;
}

export interface ColorizeOptions {
	/**
	 * 是否允許在 IRC 頻道中使用顏色
	 */
	enabled: boolean;

	/**
	 * < 整行通知的顏色 >
	 */
	broadcast?: IRCColor;

	/**
	 * 用於標記使用者端「<T>」的顏色
	 */
	client?: IRCColor;

	/**
	 * nick 的顏色。除標準顏色外，亦可設為 colorful
	 */
	nick?: IRCColor | "colorful";

	/**
	 * Re replyto 的顏色
	 */
	replyto?: IRCColor;

	/**
	 * 被 Re 的訊息的顏色
	 */
	repliedmessage?: IRCColor;

	/**
	 * Fwd fwdfrom 的顏色
	 */
	fwdfrom?: IRCColor;

	/**
	 * 行分隔符的顏色
	 */
	linesplit?: IRCColor;

	/**
	 * 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分布均勻，建議使顏色數量為質數
	 */
	nickcolors?: IRCColor[];
}

export interface TransportIRCOptions {
	notify: NotifyOptions;

	/**
	 * 這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
	 *   /msg ChanServ SET #頻道 MLOCK -c
	 *
	 *   轉發機器人的訊息有以下三種格式：
	 *   <T> [nick] message
	 *   <T> [nick] Re replyto 「repliedmessage」: message
	 *   <T> [nick] Fwd fwdfrom: message
	 *
	 *   （兩群互聯不會出現用於標識軟體的「<T>」）
	 *
	 *   可用顏色：white、black、navy、green、red、brown、purple、
	 *   olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
	 */
	colorize: ColorizeOptions;
}

let config: TransportConfig;
let options: Partial<TransportIRCOptions>;
let icHandler: IRCMessageHandler;
let messageStyle: TransportMessageStyle;
let colorize: ColorizeOptions;

function init( _icHandler: IRCMessageHandler, _config: TransportConfig ) {
	config = _config;
	options = config.options.IRC ?? {};
	icHandler = _icHandler;
	messageStyle = config.options.messageStyle ?? defaultMessageStyle;

	// 自動加頻道
	icHandler.once( "event.registered", function () {
		for ( const g in bridgeMap ) {
			const cl = parseUID( g );
			if ( cl.client === "IRC" ) {
				// eslint-disable-next-line max-len
				// winston.warn( `[transport/processor/IC] please set channel "${ cl.id }" to config.IRC.bot.channels, auto join by processors is deprecated.` );
				icHandler.join( cl.id );
			}
		}
	} );

	colorize = options.colorize ?? {
		enabled: false
	};

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
			if ( !( context.from in userList ) ) {
				userList[ context.from ] = {};
			}

			userList[ context.from ][ String( context.to ).toLowerCase() ] = Date.now();
		}
	} );

	/*
	 * 頻道 Topic 變更
	 */
	icHandler.on( "channel.topic", function ( channel, topic, nick, message ) {
		if ( message.command === "TOPIC" && options.notify?.topic ) {
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
	const awaySpan = 1000 * ( options.notify.timeBeforeLeave ?? 0 );
	const userList: Record<string, Record<string, number>> = {};

	icHandler.on( "channel.join", function ( channel, nick, message ) {
		if ( options.notify?.join && nick !== icHandler.nick ) {
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
		return userList[ nick ][ channel ] &&
				awaySpan > 0 && ( now - userList[ nick ][ channel ] <= awaySpan );
	}

	icHandler.on( "event.nick", function ( oldNick, newNick, _channels, rawdata ) {
		// 記錄使用者更名情況
		if ( oldNick in userList ) {
			userList[ newNick ] = userList[ oldNick ];
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete userList[ oldNick ];
		}

		const message = `${ oldNick } 更名為 ${ newNick }`;

		for ( const ch in icHandler.chans ) {
			const chan = ch.toLowerCase();

			if (
				( options.notify?.rename === "all" || options.notify?.rename === true ) ||
				( options.notify?.rename === "onlyactive" && newNick in userList && chan in userList[ newNick ] )
			) {
				send( new BridgeMsg( {
					from: chan,
					to: chan,
					nick: newNick,
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

		for ( const ch of chans ) {
			const chan = ch.toLowerCase();
			if (
				( options.notify?.rename === "all" || options.notify?.rename === true ) ||
				( options.notify?.rename === "onlyactive" && isActive( nick, chan ) )
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

			if ( nick in userList ) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete userList[ nick ][ chan ];
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		client_short: msg.extra.clientName?.shortname ?? msg.handler!.id,
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		client_full: msg.extra.clientName?.fullname ?? msg.handler!.type,
		command: msg.command,
		param: msg.param
	};
	if ( msg.extra.reply ) {
		const reply = msg.extra.reply;
		meta.reply_nick = reply.nick;
		if ( reply.username ) {
			meta.reply_user = reply.username;
		}
		if ( reply.isText ) {
			meta.reply_text = truncate( reply.message );
		} else {
			meta.reply_text = reply.message;
		}
	}
	if ( msg.extra.forward ) {
		meta.forward_nick = msg.extra.forward.nick;
		if ( msg.extra.forward.username ) {
			meta.forward_user = msg.extra.forward.username;
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

	// 给消息上色
	let output: string;
	if ( msg.extra.isAction ) {
		output = format( template, meta );
		if ( colorize.enabled && colorize.broadcast ) {
			output = color[ colorize.broadcast ]( output );
		}
	} else {
		if ( colorize.enabled ) {
			if ( colorize.client ) {
				meta.client_short = color[ colorize.client ]( meta.client_short );
				meta.client_full = color[ colorize.client ]( meta.client_full );
			}
			if ( colorize.nick ) {
				if ( colorize.nick === "colorful" ) {
					if ( colorize.nickcolors?.length ) {
						// hash
						const m = meta.nick.split( "" )
							.map( function ( x ) {
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								return x.codePointAt( 0 )!;
							} )
							.reduce( function ( x, y ) {
								return x + y;
							} );
						const n = colorize.nickcolors.length;
						meta.nick = color[ colorize.nickcolors[ m % n ] ]( meta.nick );
					}
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
			output += msg.extra.uploads.map( function ( u ) {
				return ` ${ u.url }`;
			} ).join();
		}
	}

	await icHandler.say( msg.to, output );
}

export default {
	init,
	receive
} as TransportProcessor<"IRC">;
