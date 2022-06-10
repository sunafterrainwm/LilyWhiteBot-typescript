import lodash = require( "lodash" );
import irc = require( "irc-upd" );
import color = require( "irc-colors" );
import winston = require( "winston" );

import { BaseEvents, MessageHandler } from "@app/lib/handlers/MessageHandler";
import { Context } from "@app/lib/handlers/Context";
import delay from "@app/lib/delay";

export interface IRCConfig {
	bot: {
		server: string;
		/**
		 * IRC 暱稱
		 */
		nick: string;

		userName: string;

		realName: string;
		/**
		 * 需要加入的頻道
		 */
		channels: string[];

		autoRejoin: boolean;

		secure: boolean;

		port: number;

		floodProtection: boolean;

		floodProtectionDelay: number;

		sasl: boolean;

		sasl_password: string;

		encoding: string;
	};

	options: {
		maxLines: number;

		/**
		 * 無視某些成員的訊息
		 */
		ignore?: string[];
	};
}

declare module "@config/config.type" {
	interface ClientConfigs {
		IRC: IRCConfig;
	}
}

export interface IRCEvents extends BaseEvents<irc.Client, irc.IMessage> {
	"event.nick"( oldnick: string, newnick: string, channels: string[], message: irc.IMessage ): void;
	"event.quit"( nick: string, reason: string, channels: string[], message: irc.IMessage ): void;
	"event.kill"( nick: string, reason: string, channels: string[], message: irc.IMessage ): void;
	"event.registered"( message: irc.IMessage ): void;

	"channel.text"( context: Context<irc.IMessage> ): void;
	"channel.command"( context: Context<irc.IMessage>, comand: string, param: string ): void;
	[ key: `channel.command#${ string }` ]: ( context: Context<irc.IMessage>, param: string ) => void;
	"channel.join"( channel: string, nick: string, message: irc.IMessage ): void;
	"channel.part"( channel: string, nick: string, reason: string, message: irc.IMessage ): void;
	"channel.kick"( channel: string, nick: string, by: string, reason: string, message: irc.IMessage ): void;
	"channel.topic"( channel: string, topic: string, nick: string, message: irc.IMessage ): void;
}

type Me = {
	nick: string;
	userName: string;
	realName: string;
	chans: irc.IChans;
};

/*
 * 使用通用接口处理 IRC 消息
 */
export class IRCMessageHandler extends MessageHandler<irc.Client, irc.IMessage, IRCEvents> {
	protected readonly _client: irc.Client;
	public get rawClient(): irc.Client {
		return this._client;
	}

	protected readonly _type: "IRC" = "IRC";
	protected readonly _id: "I" = "I";

	readonly #maxLines: number;

	#me: Me;
	public get me(): Me {
		return this.#me;
	}

	readonly #splitsep: {
		prefix: string;
		postfix: string;
	} = {
			prefix: "",
			postfix: ""
		};

	public get splitPrefix(): string {
		return this.#splitsep.prefix;
	}
	public set splitPrefix( p: string ) {
		this.#splitsep.prefix = p;
	}

	public get splitPostfix(): string {
		return this.#splitsep.postfix;
	}
	public set splitPostfix( p: string ) {
		this.#splitsep.postfix = p;
	}

	public get nick(): string {
		return this._client.nick;
	}

	public get chans(): irc.IChans {
		return this._client.chans;
	}

	public constructor( config: Partial<IRCConfig> = {} ) {
		super( config );

		// 加载机器人
		const botConfig: Partial<IRCConfig[ "bot" ]> = config.bot;
		const ircOptions: Partial<IRCConfig[ "options" ]> = config.options || {};
		const client = new irc.Client( botConfig.server, botConfig.nick, {
			userName: botConfig.userName,
			realName: botConfig.realName,
			port: botConfig.port,
			autoRejoin: true,
			channels: botConfig.channels || [],
			secure: botConfig.secure || false,
			floodProtection: botConfig.floodProtection || true,
			floodProtectionDelay: botConfig.floodProtectionDelay || 300,
			sasl: botConfig.sasl,
			password: botConfig.sasl_password,
			encoding: botConfig.encoding || "UTF-8",
			autoConnect: false
		} );

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;

		this._client = client;
		this.#maxLines = ircOptions.maxLines || 4;

		this.#me = {
			nick: this._client.nick,
			userName: botConfig.userName,
			realName: botConfig.realName,
			chans: this.chans
		};

		client.on( "registered", async function ( message ) {
			that.emit( "event.registered", message );
			winston.info( "[IC] IRCBot has been registered." );
			while ( client.nick === client.hostMask ) {
				await delay( 100 );
			}
			that.emit( "event.ready", client );
			that.#me.nick = client.nick;
			winston.info( `[IC] IRCBot is ready, login as: ${ client.nick }!${ client.hostMask }.` );
		} );

		client.on( "join", function ( channel, nick ) {
			if ( nick === client.nick ) {
				winston.info( `[IC] IRCBot has joined channel: ${ channel } as ${ nick }` );
			}
		} );

		client.on( "error", function ( message ) {
			winston.error( `[IC] IRCBot error: ${ message.command } (${ ( message.args || [] ).join( " " ) })` );
		} );

		// 绑定事件
		function processMessage( from: string, to: string, text: string, rawdata: irc.IMessage, isAction = false ) {
			if (
				!that._enabled ||
				from === client.nick ||
				ircOptions.ignore.map( function ( name ) {
					return new RegExp( `^${ lodash.escapeRegExp( name ) }\\d*$` );
				} ).filter( function ( reg ) {
					return reg.exec( from );
				} ).length
			) {
				return;
			}

			// 去除訊息中的格式字元
			const plainText: string = color.stripColorsAndStyle( text );

			const context = new Context( {
				from: from,
				to: to,
				nick: from,
				text: plainText,
				isPrivate: to === client.nick,
				extra: {},
				handler: that,
				_rawdata: rawdata
			} );

			if ( to !== client.nick ) {
				context.to = to.toLowerCase();
			}

			if ( isAction ) {
				context.extra.isAction = true;
			}

			// 檢查是不是命令
			// eslint-disable-next-line prefer-const
			let [ , cmd, , param ] = plainText.match( /^!([A-Za-z0-9_]+)\b(\s+(.*)|\s*)$/u ) || [];
			if ( cmd ) {
				param = ( param || "" ).trim();
				context.command = cmd;
				context.param = param;

				if ( typeof that._commands.get( cmd ) === "function" ) {
					that._commands.get( cmd )( context, cmd, param );
				}

				that.emit( "channel.command", context, cmd, param );
				that.emit( `channel.command#${ cmd }`, context, param );
				that.emit( "event.command", context, cmd, param || "" );
				that.emit( `event.command#${ cmd }`, context, cmd, param || "" );
			}

			that.emit( "channel.text", context );
			that.emit( "event.message", context );
		}

		client.on( "message", processMessage );
		client.on( "action", function ( from, to, text, rawdata ) {
			processMessage( from, to, text, rawdata, true );
		} );

		client.on( "join", function ( channel, nick, message ) {
			that.emit( "channel.join", channel, nick, message );
		} );

		client.on( "topic", function ( channel, topic, nick, message ) {
			that.emit( "channel.topic", channel, topic, nick, message );
		} );

		client.on( "part", function ( channel, nick, reason, message ) {
			that.emit( "channel.part", channel, nick, reason, message );
		} );

		client.on( "kick", function ( channel, nick, by, reason, message ) {
			that.emit( "channel.kick", channel, nick, by, reason, message );
		} );

		client.on( "nick", function ( oldnick, newnick, channels, message ) {
			that.emit( "event.nick", oldnick, newnick, channels, message );
		} );

		client.on( "quit", function ( nick, reason, channels, message ) {
			that.emit( "event.quit", nick, reason, channels, message );
		} );

		client.on( "kill", function ( nick, reason, channels, message ) {
			that.emit( "event.kill", nick, reason, channels, message );
		} );
	}

	public async say( target: string, message: string, options: {
		isAction?: boolean;
		doNotSplitText?: boolean;
	} = {} ): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		if ( !that._enabled ) {
			throw new Error( "Handler not enabled" );
		} else if ( !target.length ) {
			return;
		} else {
			const lines = options.doNotSplitText ?
				[ ...message.split( "\n" ).map( function ( s ) {
					return that.splitText( s, 449, that.#maxLines );
				} ).flat( Infinity ) ] :
				that.splitText( message, 449, that.#maxLines );
			if ( options.isAction ) {
				that._client.action( target, lines.join( "\n" ) );
			} else {
				that._client.say( target, lines.join( "\n" ) );
			}
		}
	}

	public async reply( context: Context, message: string, options: {
		isPrivate?: boolean;
		withNick?: boolean;
		isAction?: boolean;
	} = {} ): Promise<void> {
		if ( context.isPrivate ) {
			await this.say( String( context.from ), message, options );
		} else {
			if ( options.withNick ) {
				await this.say( String( context.to ), `${ context.nick }: ${ message }`, options );
			} else {
				await this.say( String( context.to ), `${ message }`, options );
			}
		}
	}

	public whois( nick: string ): Promise<irc.IWhoisData> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that: this = this;
		return new Promise( function ( resolve ) {
			that._client.whois( nick, resolve );
		} );
	}

	public splitText( text: string, maxBytesPerLine = 449, maxLines = 0 ): string[] {
		const text2 = text.replace( /\n+/gu, "\n" ).replace( /\n*$/gu, "" );
		const lines: string[] = [];
		let line: string[] = [];
		let bytes = 0;
		const seplen: number = this.#splitsep.prefix.length + this.#splitsep.postfix.length;

		if ( maxBytesPerLine < 10 ) {
			return [];
		}

		for ( const ch of text2 ) {
			if ( ch === "\n" ) {
				lines.push( line.join( "" ) );
				line = [];
				bytes = 0;
				if ( maxLines > 0 && lines.length === maxLines + 1 ) {
					break;
				}
			} else {
				const code = ch.codePointAt( 0 );
				const b = ( code <= 0x7F ) ? 1 : (
					( code <= 0x7FF ) ? 2 : (
						( code <= 0xFFFF ) ? 3 : (
							( code <= 0x10FFFF ) ? 4 : 5
						)
					)
				);

				if ( bytes + b > maxBytesPerLine - seplen ) {
					line.push( this.#splitsep.postfix );
					lines.push( line.join( "" ) );
					line = [ this.#splitsep.prefix, ch ];
					bytes = b;
					if ( maxLines > 0 && lines.length === maxLines ) {
						lines.push( line.join( "" ) );
						break;
					}
				} else {
					line.push( ch );
					bytes += b;
				}
			}
		}

		if ( maxLines > 0 && lines.length > maxLines ) {
			lines.pop();
			lines.push( "..." );
		} else if ( line.length > 0 ) {
			if ( maxLines > 0 && lines.length === maxLines ) {
				lines.push( "..." );
			} else {
				lines.push( line.join( "" ) );
			}
		}

		return lines;
	}

	public join( channel: string, callback: irc.handlers.IJoinChannel = function () {
		// ignore
	} ) {
		this._client.join( channel, callback );
	}

	public part( channel: string, message: string, callback: irc.handlers.IPartChannel ) {
		this._client.part( channel, message, callback );
	}

	public async start() {
		if ( !this._started ) {
			this._started = true;
			this._client.connect();
		}
	}

	public async stop() {
		if ( !this._started ) {
			this._started = false;
			this._client.disconnect( "disconnect by operator.", function () {
				// ignore
			} );
		}
	}
}

export {
	IRCMessageHandler as default
};
