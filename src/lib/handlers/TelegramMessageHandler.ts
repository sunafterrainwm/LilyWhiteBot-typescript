import fs = require( "fs" );
import https = require( "https" );
import { HttpsProxyAgent } from "https-proxy-agent";
import { cloneDeep as copyObject } from "lodash";
import { Telegraf, Context as TContext, Telegram } from "telegraf";
import type * as TGT from "telegraf/typings/telegram-types";
import tls = require( "tls" );
import type * as TT from "typegram";
import winston = require( "winston" );

import { MessageHandler, Command, BaseEvents } from "@app/lib/handlers/MessageHandler";
import { Context, File } from "@app/lib/handlers/Context";
import { getFriendlySize, getFriendlyLocation } from "@app/lib/util";

type TelegramConf = import( "@config/config.type" ).ConfigTS[ "Telegram" ];

export interface TelegramEvents extends BaseEvents<Telegraf, TContext> {
	"group.text"( context: Context<TContext> ): void;
	"group.command"( context: Context<TContext>, comand: string, param: string ): void;
	[ key: `group.command#${ string }` ]: ( context: Context<TContext>, param: string ) => void;
	"group.channel.text"( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
	"group.channel.richmessage"( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
	"group.richmessage"( context: Context<TContext> ): void;
	"group.pin"( info: {
		from: {
			id: number;
			nick: string;
			username?: string;
		},
		to: number;
		text: string;
	}, ctx: TContext ): void;
	"group.join"( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
		id: number;
		nick: string;
		username?: string;
	}, ctx: TContext ): void;
	"group.leave"( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
		id: number;
		nick: string;
		username?: string;
	}, ctx: TContext ): void;

	"channel.post"( channel: TT.Chat.ChannelChat, msg: TT.Message, ctx: TContext ): void;
}

type Extras = |
	TGT.ExtraReplyMessage |
	TGT.ExtraPhoto |
	TGT.ExtraSticker |
	TGT.ExtraAudio |
	TGT.ExtraVoice |
	TGT.ExtraVideo |
	TGT.ExtraDocument;

export type TelegramSendMessageOpipons<T extends Extras = TGT.ExtraReplyMessage> = Partial<T> & {
	withNick?: boolean
}

export type TelegramFallbackBots = "Link Channel" | "Group" | "Channel" | false;

/**
 * 使用通用介面處理 Telegram 訊息
 *
 * @memberof MessageHandler
 */
export class TelegramMessageHandler extends MessageHandler<Telegraf, TContext, TelegramEvents> {
	protected readonly _client: Telegraf<TContext>;
	public get rawClient(): Telegraf<TContext> {
		return this._client;
	}

	protected readonly _type: "Telegram" = "Telegram";
	protected readonly _id: "T" = "T";

	readonly #start: {
		mode: "webhook";
		params: {
			path: string;
			tlsOptions: tls.TlsOptions;
			port: string | number;
		};
	} | {
		mode: "poll";
	};

	readonly #nickStyle: "username" | "fullname" | "firstname";
	#startTime: number = Date.now() / 1000;

	#username: string;
	public get username() {
		return this.#username;
	}

	#me: TT.User;
	public get me(): TT.User {
		return this.#me;
	}

	public constructor( config: Partial<TelegramConf> = {} ) {
		super( config );

		const botConfig: Partial<TelegramConf[ "bot" ]> = config.bot || {};
		const tgOptions: Partial<TelegramConf[ "options" ]> = config.options || {};

		// 配置文件兼容性处理
		for ( const key of [ "proxy", "webhook", "apiRoot" ] ) {
			botConfig[ key ] = botConfig[ key ] || tgOptions[ key ];
		}

		// 代理
		let myAgent = https.globalAgent;
		if ( botConfig.proxy && botConfig.proxy.host ) {
			myAgent = new HttpsProxyAgent( {
				host: botConfig.proxy.host,
				port: botConfig.proxy.port
			} );
		}

		const client = new Telegraf( botConfig.token, {
			telegram: {
				agent: myAgent,
				apiRoot: botConfig.apiRoot || "https://api.telegram.org"
			}
		} );

		client.catch( function ( err ) {
			winston.error( "[TG] TelegramBot error: ", err );
		} );

		if ( botConfig.webhook && botConfig.webhook.port > 0 ) {
			const webhookConfig = botConfig.webhook;
			// 自动设置Webhook网址
			if ( webhookConfig.url ) {
				if ( webhookConfig.ssl.certPath ) {
					client.telegram.setWebhook( webhookConfig.url, {
						certificate: {
							source: webhookConfig.ssl.certPath
						}
					} );
				} else {
					client.telegram.setWebhook( webhookConfig.url );
				}
			}

			// 启动Webhook服务器
			let tlsOptions = null;
			if ( webhookConfig.ssl && webhookConfig.ssl.certPath ) {
				tlsOptions = {
					key: fs.readFileSync( webhookConfig.ssl.keyPath ),
					cert: fs.readFileSync( webhookConfig.ssl.certPath )
				};
				if ( webhookConfig.ssl.caPath ) {
					tlsOptions.ca = [
						fs.readFileSync( webhookConfig.ssl.caPath )
					];
				}
			}

			this.#start = {
				mode: "webhook",
				params: {
					path: webhookConfig.path,
					tlsOptions: tlsOptions,
					port: webhookConfig.port
				}
			};
		} else {
			// 使用轮询机制
			this.#start = {
				mode: "poll"
			};
		}

		this._client = client;
		this.#nickStyle = tgOptions.nickStyle || "username";

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;

		client.telegram.getMe().then( function ( me ) {
			that.#username = me.username;
			that.#me = me;
			winston.info( `[TG] TelegramBot is ready, login as: ${ me.first_name }${ me.last_name ? ` ${ me.last_name }` : "" }@${ me.username }(${ me.id })` );
		} );

		client.on( "message", async function ( ctx, next ) {
			if ( that._enabled && ctx.message && ctx.chat ) {
				if (
					ctx.message.date < that.#startTime ||
					tgOptions.ignore && (
						tgOptions.ignore.includes( ctx.from.id ) ||
						"sender_chat" in ctx.message && tgOptions.ignore.includes( ctx.message.sender_chat.id )
					)
				) {
					return;
				}

				const context: Context<TContext> = new Context<TContext>( {
					from: ctx.message.from.id,
					to: ctx.chat.id,
					nick: that.getNick( ctx.message.from ),
					text: "",
					isPrivate: ( ctx.chat.id > 0 ),
					extra: {
						username: ctx.message.from.username
					},
					handler: that,
					_rawdata: ctx
				} );

				if (
					ctx.from.id === 777000 /* Telegram */ &&
					"forward_from_chat" in ctx.message &&
					ctx.message.forward_from_chat.type === "channel"
				) {
					context.from = ctx.message.forward_from_chat.id;
					context.nick = "LinkChannel";
					context.extra.username = ctx.message.forward_from_chat.username;
					context.extra.isChannel = true;
				} else if (
					ctx.from.id === 1087968824 /* GroupAnonymousBot */ &&
					( ctx.message.chat.type === "group" || ctx.message.chat.type === "supergroup" )
				) {
					context.from = ctx.chat.id;
					context.nick = `Group ${ ctx.message.chat.title }`;
					context.extra.username = "username" in ctx.message.chat ? ctx.message.chat.username : null;
				} else if (
					ctx.from.id === 136817688 /* Channel_Bot */ &&
					"sender_chat" in ctx.message &&
					ctx.message.sender_chat.type === "channel"
				) {
					context.from = ctx.message.sender_chat.id;
					context.nick = `Channel ${ ctx.message.sender_chat.title }`;
					context.extra.username = ctx.message.sender_chat.username;
				}

				if ( "reply_to_message" in ctx.message ) {
					const reply: TT.ReplyMessage = ctx.message.reply_to_message;
					context.extra.reply = {
						nick: that.getNick( reply.from ),
						username: reply.from.username,
						message: that.convertToText( reply ),
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
							nick: that.getNick( fwd ),
							username: fwd.username
						};
					}
				}

				if ( "text" in ctx.message ) {
					if ( !context.text ) {
						context.text = ctx.message.text;
					}

					// 解析命令
					// eslint-disable-next-line prefer-const
					let [ , cmd, , param ] = ctx.message.text.match( /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u ) || [];
					if ( cmd ) {
						// 如果包含 Bot 名，判断是否为自己
						const [ , c, , n ] = cmd.match( /^([A-Za-z0-9_]+)(|@([A-Za-z0-9_]+))$/u ) || [];
						if ( ( n && ( n.toLowerCase() === String( that.#username ).toLowerCase() ) ) || !n ) {
							param = param || "";

							context.command = c;
							context.param = param;

							if ( typeof that._commands.get( c ) === "function" ) {
								that._commands.get( c )( context, c, param || "" );
							}

							that.emit( "group.command", context, c, param || "" );
							that.emit( `group.command#${ c }`, context, param || "" );
							that.emit( "event.command", context, c, param || "" );
							that.emit( `event.command#${ c }`, context, param || "" );
						}
					}

					if ( context.extra.isChannel && "forward_from_chat" in ctx.message ) {
						that.emit(
							"group.channel.text",
							ctx.message.forward_from_chat as TT.Chat.ChannelChat,
							context
						);
					} else {
						that.emit( "group.text", context );
						that.emit( "event.message", context );
					}
				} else {
					const message: TT.Message = ctx.message;

					if ( !await that.parseMedia( context, message ) ) {
						if ( "pinned_message" in message ) {
							that.emit( "group.pin", {
								from: {
									id: message.from.id,
									nick: that.getNick( message.from ),
									username: message.from.username
								},
								to: ctx.chat.id,
								text: that.convertToText( message.pinned_message )
							}, ctx );
						} else if ( "left_chat_member" in message ) {
							that.emit( "group.leave", ctx.chat.id, {
								id: message.from.id,
								nick: that.getNick( message.from ),
								username: message.from.username
							}, {
								id: message.left_chat_member.id,
								nick: that.getNick( message.left_chat_member ),
								username: message.left_chat_member.username
							}, ctx );
						} else if ( "new_chat_members" in message ) {
							that.emit( "group.join", ctx.chat.id, {
								id: message.from.id,
								nick: that.getNick( message.from ),
								username: message.from.username
							}, {
								id: message.new_chat_members[ 0 ].id,
								nick: that.getNick( message.new_chat_members[ 0 ] ),
								username: message.new_chat_members[ 0 ].username
							}, ctx );
						}

						return next();
					}

					if ( context.extra.isChannel ) {
						that.emit(
							"group.channel.richmessage",
							"forward_from_chat" in ctx.message && ctx.message.forward_from_chat,
							context
						);
					} else {
						that.emit( "group.richmessage", context );
					}
				}
			}
			return next();
		} );

		client.on( "channel_post", function ( ctx ) {
			that.emit( "channel.post", ctx.channelPost.chat, ctx.channelPost, ctx );
		} );
	}

	#setFile(
		context: Context,
		msg: ( TT.PhotoSize | TT.Sticker | TT.Audio | TT.Voice | TT.Video | TT.Document ) & {
			mime_type?: string;
		},
		type: "photo" | "sticker" | "audio" | "voice" | "video" | "document"
	): void {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;

		const file: File = {
			client: "Telegram",
			url: null,
			async prepareFile() {
				file.url = ( await that.getFileLink( msg.file_id ) ).href;
			},
			// eslint-disable-next-line no-shadow
			tgUploadCallback( context: Context<TContext>, replyMsgId: number ) {
				const chat_id = context.to;
				const options = that.#prepareReplyOptions<Extras>( context, replyMsgId, {} );
				switch ( type ) {
					case "photo":
						return that._client.telegram.sendPhoto( chat_id, msg.file_id, options );
					case "sticker":
						return that._client.telegram.sendSticker( chat_id, msg.file_id, options );
					case "audio":
						return that._client.telegram.sendAudio( chat_id, msg.file_id, options );
					case "voice":
						return that._client.telegram.sendVoice( chat_id, msg.file_id, options );
					case "video":
						return that._client.telegram.sendVideo( chat_id, msg.file_id, options );
					case "document":
						return that._client.telegram.sendDocument( chat_id, msg.file_id, options );
					default:
						return null;
				}
			},
			type: type,
			id: msg.file_id,
			size: msg.file_size,
			mime_type: msg.mime_type
		};
		context.extra.files = [ file ];
	}

	public async parseMedia( context: Context, message: TT.Message ) {
		if ( "photo" in message ) {
			let sz = 0;
			for ( const p of message.photo ) {
				if ( p.file_size > sz ) {
					await this.#setFile( context, p, "photo" );
					context.text = `<photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.file_size ) }>`;
					sz = p.file_size;
				}
			}

			if ( message.caption ) {
				context.text += " " + message.caption;
			}
			context.extra.isImage = true;
			context.extra.imageCaption = message.caption;
			return true;
		} else if ( "sticker" in message ) {
			context.text = `${ message.sticker.emoji }<Sticker>`;
			await this.#setFile( context, message.sticker, "sticker" );
			context.extra.isImage = true;
			return true;
		} else if ( "audio" in message ) {
			context.text = `<Audio: ${ message.audio.duration }", ${ getFriendlySize( message.audio.file_size ) }>`;
			await this.#setFile( context, message.audio, "audio" );
			return true;
		} else if ( "voice" in message ) {
			context.text = `<Voice: ${ message.voice.duration }", ${ getFriendlySize( message.voice.file_size ) }>`;
			await this.#setFile( context, message.voice, "voice" );
			return true;
		} else if ( "video" in message ) {
			context.text = `<Video: ${ message.video.width }x${ message.video.height }, ${ message.video.duration }", ${ getFriendlySize( message.video.file_size ) }>`;
			await this.#setFile( context, message.video, "video" );
			return true;
		} else if ( "document" in message ) {
			context.text = `<File: ${ message.document.file_name }, ${ getFriendlySize( message.document.file_size ) }>`;
			await this.#setFile( context, message.document, "document" );
			return true;
		} else if ( "contact" in message ) {
			context.text = `<Contact: ${ message.contact.first_name }, ${ message.contact.phone_number }>`;
			return true;
		} else if ( "venue" in message ) {
			context.text = `<Venue: ${ message.venue.title }, ${ message.venue.address }, ${ getFriendlyLocation(
				message.venue.location.latitude, message.venue.location.longitude ) }>`;
			return true;
		} else if ( "location" in message ) {
			context.text = `<Location: ${ getFriendlyLocation( message.location.latitude, message.location.longitude ) }>`;
			return true;
		}
		return false;
	}

	public getNick( user: TT.User ) {
		if ( user ) {
			const username = ( user.username || "" ).trim();
			const firstname = ( user.first_name || "" ).trim() || ( user.last_name || "" ).trim();
			const fullname = `${ user.first_name || "" } ${ user.last_name || "" }`.trim();

			if ( this.#nickStyle === "fullname" ) {
				return fullname || username;
			} else if ( this.#nickStyle === "firstname" ) {
				return firstname || username;
			} else {
				return username || fullname;
			}
		} else {
			return "";
		}
	}

	public convertToText( message: TT.ReplyMessage ) {
		if ( "audio" in message ) {
			return "<Audio>";
		} else if ( "photo" in message ) {
			return "<Photo>";
		} else if ( "document" in message ) {
			return "<Document>";
		} else if ( "game" in message ) {
			return "<Game>";
		} else if ( "sticker" in message ) {
			return `${ message.sticker.emoji }<Sticker>`;
		} else if ( "video" in message ) {
			return "<Video>";
		} else if ( "voice" in message ) {
			return "<Voice>";
		} else if ( "contact" in message ) {
			return "<Contact>";
		} else if ( "location" in message ) {
			return "<Location>";
		} else if ( "venue" in message ) {
			return "<Venue>";
		} else if ( "pinned_message" in message ) {
			return "<Pinned Message>";
		} else if ( "new_chat_member" in message ) {
			return "<New member>";
		} else if ( "left_chat_member" in message ) {
			return "<Removed member>";
		} else if ( "text" in message ) {
			return message.text;
		} else {
			return "<Message>";
		}
	}

	public isTelegramFallbackBot( message: TT.Message ): [ TelegramFallbackBots, number ] {
		const fwdChat =
		(
			"forward_from_chat" in message &&
			message.forward_from_chat.type === "channel"
		) ?
			message.forward_from_chat :
			null;

		if (
			message.from.id === 777000 /* Telegram */ &&
			fwdChat && fwdChat.type === "channel"
		) {
			return [ "Link Channel", fwdChat.id ];
		} else if (
			message.from.id === 1087968824 /* GroupAnonymousBot */
		) {
			return [ "Group", message.chat.id ];
		} else if (
			message.from.id === 136817688 /* Channel Bot */ &&
			message.sender_chat
		) {
			return [ "Channel", message.sender_chat.id ];
		}

		return [ false, message.from.id ];
	}

	public addCommand( command: string, func: Command<TContext> ) {
		// 自動過濾掉 command 中的非法字元
		const cmd = command.replace( /[^A-Za-z0-9_]/gu, "" );
		return super.addCommand( cmd, func );
	}

	public aliasCommand( command: string, rawCommand: string ): this {
		const cmd = command.replace( /[^A-Za-z0-9_]/gu, "" );
		const rwcmd = rawCommand.replace( /[^A-Za-z0-9_]/gu, "" );
		return super.aliasCommand( cmd, rwcmd );
	}

	public deleteCommand( command: string ) {
		const cmd = command.replace( /[^A-Za-z0-9_]/gu, "" );
		return super.deleteCommand( cmd );
	}

	public say( target: string | number, message: string, options?: TelegramSendMessageOpipons ): Promise<TT.Message> {
		if ( !this._enabled ) {
			throw new Error( "Handler not enabled" );
		} else {
			return this._client.telegram.sendMessage( target, message, options );
		}
	}

	public sayWithHTML(
		target: string | number,
		message: string,
		options?: TelegramSendMessageOpipons
	): Promise<TT.Message> {
		const options2 = copyObject( options || {} );
		options2.parse_mode = "HTML";
		return this.say( target, message, options2 );
	}

	public sendPhoto( ...args: Parameters<Telegram[ "sendPhoto" ]> ): Promise<TT.Message.PhotoMessage> {
		return this._client.telegram.sendPhoto( ...args );
	}

	public sendAudio( ...args: Parameters<Telegram[ "sendAudio" ]> ): Promise<TT.Message.AudioMessage> {
		return this._client.telegram.sendAudio( ...args );
	}
	public sendVideo( ...args: Parameters<Telegram[ "sendVideo" ]> ): Promise<TT.Message.VideoMessage> {
		return this._client.telegram.sendVideo( ...args );
	}

	public sendAnimation( ...args: Parameters<Telegram[ "sendAnimation" ]> ): Promise<TT.Message.AnimationMessage> {
		return this._client.telegram.sendAnimation( ...args );
	}

	public sendDocument( ...args: Parameters<Telegram[ "sendDocument" ]> ): Promise<TT.Message.DocumentMessage> {
		return this._client.telegram.sendDocument( ...args );
	}

	#prepareReplyOptions<T extends Extras = TGT.ExtraReplyMessage>(
		context: Context<TContext>,
		replyMsgId: number,
		options?: TelegramSendMessageOpipons<T>
	): TelegramSendMessageOpipons<T> {
		if ( ( context._rawdata && context._rawdata.message ) ) {
			if ( context.isPrivate ) {
				return options;
			} else {
				const options2 = copyObject<TelegramSendMessageOpipons<T>>( options || {} );
				options2.reply_to_message_id = replyMsgId;
				options2.allow_sending_without_reply = true;
				return options2;
			}
		} else {
			throw new Error( "No messages to reply" );
		}
	}

	public reply(
		context: Context<TContext>,
		message: string,
		options?: TelegramSendMessageOpipons
	): Promise<TT.Message> {
		return this.say(
			context.to,
			message,
			this.#prepareReplyOptions( context, context._rawdata.message.message_id, options )
		);
	}

	public replyWithPhoto(
		context: Context<TContext>,
		photo: TT.InputFile,
		options?: TelegramSendMessageOpipons<TGT.ExtraPhoto>
	): Promise<TT.Message.PhotoMessage> {
		return this._client.telegram.sendPhoto(
			context.to,
			photo,
			this.#prepareReplyOptions( context, context._rawdata.message.message_id, options )
		);
	}

	public getChatAdministrators( group: string | number ): Promise<TT.ChatMember[]> {
		return this._client.telegram.getChatAdministrators( group );
	}

	public getFile( fileId: string ): Promise<TT.File> {
		return this._client.telegram.getFile( fileId );
	}

	public getFileLink( fileId: string ): Promise<URL> {
		return this._client.telegram.getFileLink( fileId );
	}

	public leaveChat( chatId: string | number ): Promise<boolean> {
		return this._client.telegram.leaveChat( chatId );
	}

	public async start() {
		if ( !this._started ) {
			this._started = true;

			let startPromise: Promise<void>;

			if ( this.#start.mode === "webhook" ) {
				startPromise = this._client.launch( {
					webhook: {
						hookPath: this.#start.params.path,
						tlsOptions: this.#start.params.tlsOptions,
						port: Number( this.#start.params.port )
					}
				} );
			} else {
				startPromise = this._client.launch();
			}

			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const that = this;

			startPromise.then( function () {
				that.emit( "event.ready", that._client );
			} );
		}
	}

	public async stop() {
		if ( this._started ) {
			this._started = false;
			this._client.stop();
		}
	}
}

export {
	TelegramMessageHandler as default
};
