import type { IMessage } from "irc-upd";
import type { Context as TContext } from "telegraf";
import type { Message as DMessage } from "discord.js";
import type { Message } from "typegram";

import type { MessageHandler } from "@app/lib/handlers/MessageHandler";

let msgId = 0;

export interface RawMsgMap {
	Telegram: TContext;
	IRC: IMessage;
	Discord: DMessage;
}

export type RawMsg = RawMsgMap[keyof RawMsgMap];

export type File = {
	/**
	 * 用於區分
	 */
	client: string;

	url?: string;

	path?: string;

	type: string;

	id: string;

	size?: number;

	mime_type?: string;

	prepareFile?(): Promise<void>;

	tgUploadCallback?( context: Context, replyMsgId: number ): Promise<Message>;
};

export type UploadFile = {
	type: string;

	url: string;
};

export type ContextExtra = {
	/**
	 * 本次傳送有幾個群互聯？（由 bridge 發送）
	 */
	clients?: number;

	clientName?: {
		shortname: string;
		fullname: string;
	};
	/**
	 * 對應到目標群組之後的 to（由 bridge 發送）
	 */
	mapto?: string[];

	reply?: {
		id: string | number;
		nick: string;
		username?: string;
		message: string;
		isText?: boolean;
		discriminator?: string;
		_rawdata?: RawMsg;
	};

	forward?: {
		nick: string;
		username: string;
	};

	files?: File[];

	ats?: string[];

	/**
	 * Telegram
	 */

	username?: string;

	isChannel?: boolean;

	uploads?: UploadFile[];

	isImage?: boolean;

	imageCaption?: string;

	/**
	 * IRC
	 */
	isAction?: boolean;

	discriminator?: string;
};

export type ContextOptin<rawdata extends RawMsg> = {
	from?: string | number | null;
	to?: string | number | null;
	nick?: string;
	text?: string;
	isPrivate?: boolean;
	extra?: ContextExtra;
	handler?: MessageHandler | null;
	_rawdata?: rawdata | null;
	command?: string;
	param?: string;
}

function getMsgId(): number {
	msgId++;
	return msgId;
}

/**
 * 統一格式的訊息上下文
 */
export class Context<R extends RawMsg = RawMsg> implements ContextOptin<R> {
	protected _from: string = null;
	public get from(): string {
		return this._from;
	}
	public set from( value: string | number | null ) {
		this.onSet_from( value );
		this._from = String( value );
	}

	protected _to: string = null;
	public get to(): string {
		return this._to;
	}
	public set to( value: string | number | null ) {
		this.onSet_to( value );
		this._to = String( value );
	}

	protected onSet_from( _newVal: string | number | null ) {
		// ignore
	}

	protected onSet_to( _newVal: string | number | null ) {
		// ignore
	}

	public nick = "";

	public text = "";

	public isPrivate = false;

	public readonly isbot: boolean = false;

	public extra: ContextExtra = {};
	public readonly handler: MessageHandler | null = null;
	public _rawdata: R | null = null;
	public command = "";
	public param = "";

	private readonly _msgId: number = getMsgId();

	protected static getArgument<T>( ...args: T[] ): T | undefined {
		for ( let i = 0; i < args.length; i++ ) {
			if ( typeof args[ i ] !== "undefined" ) {
				return args[ i ];
			}
		}
		return undefined;
	}

	public constructor( options: Context<R> | ContextOptin<R> = {}, overrides: ContextOptin<R> = {} ) {
		// TODO 雖然這樣很醜陋，不過暫時先這樣了
		for ( const k of [ "from", "to", "nick", "text", "isPrivate", "extra", "handler", "_rawdata", "command", "param" ] ) {
			this[ k ] = Context.getArgument( overrides[ k ], options[ k ], this[ k ] );
		}

		if ( overrides.text !== undefined ) {
			this.command = overrides.command || "";
			this.param = overrides.param || "";
		}
	}

	public say( target: string, message: string, options?: Record<string, string | boolean | number> ): void {
		if ( this.handler ) {
			this.handler.say( target, message, options );
		}
	}

	public reply( message: string, options?: Record<string, string | boolean | number> ): void {
		if ( this.handler ) {
			this.handler.reply( this, message, options );
		}
	}

	public get msgId() {
		return this._msgId;
	}

	public static getUIDFromContext( context: Context, id?: number | string ) {
		if ( !context.handler ) {
			return null;
		}

		id = id || context.from;

		return Context.getUIDFromHandler( context.handler, id );
	}

	public static getUIDFromHandler( handler: MessageHandler, id: number | string ) {
		return `${ handler.type.toLowerCase() }/${ id }`;
	}
}
