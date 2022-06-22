import type { Telegraf as TelegrafClient, Telegram as TelegrafTelegram } from "telegraf";
import type { Client as DiscordClient } from "discord.js";
import type { Client as IRCClient } from "irc-upd";

import EventEmitter, { Events, EventEmitterConfig } from "@app/lib/eventemitter2";
import type { Context, RawDataContext, RawMsg } from "@app/lib/handlers/Context";
import type { AwaitParam } from "@app/utiltype";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Command<rawdata extends RawMsg = any> = (
	context: RawDataContext<rawdata>,
	cmd: string,
	param: string
) => AwaitParam<void>;

export type Telegraf = TelegrafClient;
export type Telegram = TelegrafTelegram;
export type Discord = DiscordClient;
export type IRC = IRCClient;

export type RawClient = Telegraf | Discord | IRC;

export interface BaseEvents<C extends RawClient, M extends RawMsg> extends Events {
	"event.ready"( client: C ): void;
	"event.message"( context: RawDataContext<M> ): void;
	"event.command"( context: RawDataContext<M>, command: string, param: string ): void;
	[ key: `event.command#${ string }` ]: ( context: RawDataContext<M>, param: string ) =>void;
}

/**
 * 使用統一介面處理訊息
 *
 * MessageHandler 的目的是為不同種類的機器人提供統一的介面。在統一的 context 之下，它們也可以忽略訊息來源的軟件，以自己能夠
 * 接受的方式輸出其他群組的訊息
 *
 * @abstract
 */
export abstract class MessageHandler<
	C extends RawClient = RawClient,
	M extends RawMsg = RawMsg,
	E extends Events = BaseEvents<C, M>
> extends EventEmitter<E> {
	protected abstract _client: RawClient;
	public abstract rawClient: RawClient;

	protected abstract _type: string;
	public get type() {
		return this._type;
	}

	protected abstract _id: string;
	public get id() {
		return this._id;
	}

	protected _enabled = true;
	public get enabled() {
		return this._enabled;
	}
	public set enabled( value ) {
		this._enabled = !!value;
	}

	protected _started = false;
	public get started() {
		return this._started;
	}

	protected readonly _commands: Map<string, Command> = new Map();

	public constructor( options: unknown ) {
		super( options as EventEmitterConfig | undefined ?? {} );
	}

	// eslint-disable-next-line max-len
	public abstract say( target: string | number, message: string, options?: Record<string, unknown> ): Promise<unknown>;

	public abstract reply( context: Context, message: string, options?: Record<string, unknown> ): Promise<unknown>;

	public addCommand( command: string, func?: Command<M> ) {
		if ( ( !command ) || ( command.trim() === "" ) ) {
			return this;
		}

		if ( typeof func === "function" ) {
			this._commands.set( command, func );
		} else {
			this._commands.set( command, function () {
				// ignore
			} );
		}
		return this;
	}

	public aliasCommand( command: string, rawCommand: string ): this {
		if ( ( !rawCommand ) || ( rawCommand.trim() === "" ) ) {
			return this;
		}

		const func = this._commands.get( rawCommand );

		if ( !func ) {
			return this;
		}
		return this.addCommand( command, func );
	}

	public deleteCommand( command: string ) {
		this._commands.delete( command );
		return this;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async start() {
		this._started = true;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async stop() {
		this._started = false;
	}
}
