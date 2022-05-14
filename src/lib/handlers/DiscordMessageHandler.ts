import Discord = require( "discord.js" );
import winston = require( "winston" );

import { BaseEvents, MessageHandler } from "@app/src/lib/handlers/MessageHandler";
import { Context, ContextExtra } from "@app/src/lib/handlers/Context";
import { getFriendlySize } from "@app/src/lib/util";

type DiscordConf = import( "@app/config/config.type" ).ConfigTS[ "Discord" ];

export interface DiscordEvents extends BaseEvents<Discord.Client, Discord.Message> {
	"channel.text"( context: Context<Discord.Message> ): void;
	"channel.command"( context: Context<Discord.Message>, comand: string, param: string ): void;
	[ key: `channel.command#${ string }` ]: ( context: Context<Discord.Message>, param: string ) => void;
	"channel.pin"( info: {
		from: Discord.User,
		to: Discord.Channel;
		text: string;
		rawdata: Discord.Message;
	} ): void;
	"channel.thread.create"( thread: Discord.ThreadChannel, name: string ): void;
	"channel.thread.delete"( thread: Discord.ThreadChannel, name: string ): void;
	"channel.thread.update"( oldThread: Discord.ThreadChannel, newThread: Discord.ThreadChannel ): void;
}

export type DiscordSendMessage = string | Discord.MessageOptions;

/*
 * 使用通用介面處理 Discord 訊息
 */
export class DiscordMessageHandler extends MessageHandler<Discord.Client, Discord.Message, DiscordEvents> {
	protected readonly _client: Discord.Client;
	protected readonly _type: "Discord" = "Discord";
	protected readonly _id: "D" = "D";

	readonly #token: string;
	readonly #nickStyle: "nickname" | "username" | "id";
	readonly #useProxyURL: boolean = false;
	public get useProxyURL(): boolean {
		return this.#useProxyURL;
	}
	readonly #relayEmoji: boolean = false;
	public get relayEmoji(): boolean {
		return this.#relayEmoji;
	}

	public get rawClient(): Discord.Client {
		return this._client;
	}

	#me: Discord.ClientUser;
	public get me(): Discord.ClientUser {
		return this.#me;
	}

	constructor( config: Partial<DiscordConf> = {} ) {
		super( config );

		const botConfig: Partial<DiscordConf[ "bot" ]> = config.bot || {};
		const discordOptions: Partial<DiscordConf[ "options" ]> = config.options || {};

		const client = new Discord.Client( {
			intents: [
				Discord.Intents.FLAGS.GUILDS,
				Discord.Intents.FLAGS.GUILD_MEMBERS,
				// Discord.Intents.FLAGS.GUILD_BANS,
				Discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
				Discord.Intents.FLAGS.GUILD_INTEGRATIONS,
				// Discord.Intents.FLAGS.GUILD_WEBHOOKS,
				// Discord.Intents.FLAGS.GUILD_INVITES,
				// Discord.Intents.FLAGS.GUILD_VOICE_STATES,
				// Discord.Intents.FLAGS.GUILD_PRESENCES,
				Discord.Intents.FLAGS.GUILD_MESSAGES,
				// Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
				// Discord.Intents.FLAGS.GUILD_MESSAGE_TYPING,
				Discord.Intents.FLAGS.DIRECT_MESSAGES,
				Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS
				// Discord.Intents.FLAGS.DIRECT_MESSAGE_TYPING
			]
		} );

		client.on( "ready", function () {
			that.emit( "event.ready", client );
			winston.info( "[DC] DiscordBot is ready." );
		} );

		client.on( "error", function ( message ) {
			winston.error( "[DC] DiscordBot Error:", message );
		} );

		this._client = client;
		this.#token = botConfig.token;
		this.#nickStyle = discordOptions.nickStyle || "username";
		this.#useProxyURL = discordOptions.useProxyURL;
		this.#relayEmoji = discordOptions.relayEmoji;

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;

		client.on( "messageCreate", async function ( rawdata: Discord.Message ) {
			if (
				!that._enabled ||
				rawdata.author.id === client.user.id ||
				discordOptions.ignoreBot && rawdata.author.bot ||
				discordOptions.ignore && discordOptions.ignore.includes( rawdata.author.id ) ||
				// TODO: MessageEmbed轉文字
				!rawdata.content && rawdata.embeds && rawdata.embeds.length
			) {
				return;
			} else if ( rawdata.type === "CHANNEL_PINNED_MESSAGE" ) {
				that.emit( "channel.pin", {
					from: rawdata.author,
					to: rawdata.channel,
					text: that.#convertToText( rawdata ),
					rawdata
				} as Parameters<DiscordEvents[ "channel.pin" ]>[ 0 ] );
				return;
			}

			let text = rawdata.content;
			const extra: ContextExtra = {};
			if ( rawdata.attachments && rawdata.attachments.size ) {
				extra.files = [];
				for ( const [ , p ] of rawdata.attachments ) {
					extra.files.push( {
						client: "Discord",
						type: "photo",
						id: p.id,
						size: p.size,
						url: that.#useProxyURL ? p.proxyURL : p.url
					} );
					text += ` <photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.size ) }>`;
				}
			}

			if ( rawdata.reference && rawdata.reference.messageId ) {
				if ( rawdata.channel.id === rawdata.reference.channelId ) {
					const msg = await rawdata.channel.messages.fetch( rawdata.reference.messageId );
					extra.reply = {
						id: rawdata.author.id,
						nick: that.getNick( msg.member || msg.author ),
						username: msg.author.username,
						discriminator: msg.author.discriminator,
						message: that.#convertToText( msg ),
						isText: !!msg.content,
						_rawdata: msg
					};
				}
			}

			const context = new Context( {
				from: rawdata.author.id,
				to: rawdata.channel.id,
				nick: that.getNick( rawdata.member || rawdata.author ),
				text: text,
				isPrivate: rawdata.channel.type === "DM",
				extra: extra,
				handler: that,
				_rawdata: rawdata
			} );

			// 檢查是不是命令
			// eslint-disable-next-line prefer-const
			let [ , cmd, , param ] = rawdata.content.trim().match( /^[/!]([A-Za-z0-9_]+)\b(\s+(.*)|\s*)$/u ) || [];
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
		} );

		client.on( "threadCreate", function ( thread ) {
			that.emit( "channel.thread.create", thread, thread.name );
		} );

		client.on( "threadDelete", function ( thread ) {
			that.emit( "channel.thread.delete", thread, thread.name );
		} );

		client.on( "threadUpdate", function ( oldThread, newThread ) {
			that.emit( "channel.thread.update", oldThread, newThread );
		} );
	}

	public async say( target: string, message: DiscordSendMessage ): Promise<Discord.Message> {
		if ( !this._enabled ) {
			throw new Error( "Handler not enabled" );
		} else {
			const channel = this._client.channels.cache.has( target ) ?
				this._client.channels.cache.get( target ) :
				await this._client.channels.fetch( target );
			if ( !channel ) {
				throw new ReferenceError( `Fetch chennel ${ target } fail.` );
			} else if ( channel.isText() ) {
				return await channel.send( message );
			}
			throw new Error( `Channel ${ target } is not't a text channel.` );
		}
	}

	public async reply( context: Context, message: DiscordSendMessage, options: {
		withNick?: boolean
	} = {} ): Promise<Discord.Message> {
		if ( context.isPrivate ) {
			return await this.say( String( context.from ), message );
		} else {
			if ( options.withNick ) {
				return await this.say( String( context.to ), `${ context.nick }: ${ message }` );
			} else {
				return await this.say( String( context.to ), `${ message }` );
			}
		}
	}

	public getNick( userobj: Discord.User | Discord.GuildMember ) {
		if ( userobj ) {
			const id: string = userobj.id;
			let nickname: string = null, username: string;
			if ( userobj instanceof Discord.GuildMember ) {
				nickname = userobj.nickname;
				username = userobj.user.username;
			} else {
				username = userobj.username;
			}

			if ( this.#nickStyle === "nickname" ) {
				return nickname || username || id;
			} else if ( this.#nickStyle === "username" ) {
				return username || id;
			} else {
				return id;
			}
		} else {
			return "";
		}
	}

	public async fetchUser( user: Discord.UserResolvable ) {
		return await this._client.users.fetch( user );
	}

	public fetchEmoji( emoji: Discord.EmojiResolvable ) {
		return this._client.emojis.resolve( emoji );
	}

	#convertToText( message: Discord.Message ) {
		if ( message.content ) {
			return message.content;
		} else if ( message.type === "CHANNEL_PINNED_MESSAGE" ) {
			return "<Pinned Message>";
		} else if ( message.type === "GUILD_MEMBER_JOIN" || message.type === "GUILD_INVITE_REMINDER" ) {
			return "<New member>";
		} else if ( message.type === "CONTEXT_MENU_COMMAND" ) {
			return "<Bot Message>";
		} else if ( message.attachments ) {
			return "<Photo>";
		} else if ( message.embeds ) {
			return "<Embeds>";
		} else {
			return "<Message>";
		}
	}

	public async start() {
		if ( !this._started ) {
			this._started = true;
			this._client.login( this.#token );
		}
	}

	public async stop() {
		if ( this._started ) {
			this._started = false;
			this._client.destroy();
		}
	}
}

export {
	DiscordMessageHandler as default
};
