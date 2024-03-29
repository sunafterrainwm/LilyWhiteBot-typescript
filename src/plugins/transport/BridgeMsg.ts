import type { PluginManager } from "@app/src/bot.type";
import { Context, ContextExtra, ContextOptin, RawMsg } from "@app/src/lib/handlers/Context";
import type { MessageHandler } from "@app/src/lib/handlers/MessageHandler";

let clientFullNames = {};

export interface BridgeMsgOptin<rawdata extends RawMsg> extends ContextOptin<rawdata> {
	plainText?: boolean;
	isNotice?: boolean;
	from_uid?: string;
	to_uid?: string;
	rawFrom?: string;
	rawTo?: string;
}

export class BridgeMsg<R extends RawMsg = RawMsg> extends Context<R> implements BridgeMsgOptin<R> {
	protected onSet_from( newVal: string | number | null ) {
		this._from_uid = `${ ( this._from_client || "" ).toLowerCase() }/${ newVal }`;
	}

	protected onSet_to( newVal: string | number | null ) {
		this._to_uid = `${ ( this._to_client || "" ).toLowerCase() }/${ newVal }`;
	}

	private _from_client: string;
	public get from_client(): string {
		return this._from_client;
	}
	private _to_client: string;
	public get to_client(): string {
		return this._to_client;
	}

	private _from_uid: string;
	public get from_uid(): string {
		return this._from_uid;
	}
	public set from_uid( u: string ) {
		const { client, id, uid } = BridgeMsg.parseUID( u );
		this._from = id;
		this._from_uid = uid;
		this._from_client = client;
	}

	private _to_uid: string;
	public get to_uid(): string {
		return this._to_uid;
	}
	public set to_uid( u: string ) {
		const { client, id, uid } = BridgeMsg.parseUID( u );
		this._to = id;
		this._to_uid = uid;
		this._to_client = client;
	}

	declare public extra: ContextExtra & {
		plainText?: boolean;
		isNotice?: boolean;
	};

	private assign<V>( root: V, ...items: V[] ) {
		items.forEach( function ( item ) {
			for ( const key in item ) {
				root[ key ] = ![ undefined, null ].includes( item[ key ] ) ? item[ key ] : root[ key ];
			}
		} );
		return root;
	}

	public constructor( context: BridgeMsg<R> | Context<R> | BridgeMsgOptin<R>, overrides: BridgeMsgOptin<R> = {} ) {
		super( context, overrides );

		const that = this.assign( {}, context, overrides ) as BridgeMsgOptin<R>;

		if ( this.handler ) {
			this._from_client = this.handler.type;
			this._to_client = this.handler.type;

			this.from = String( super.from || that.from );
			this.to = String( super.to || that.to );
		}

		for ( const k of [ "from_uid", "to_uid" ] ) {
			this[ k ] = Context.getArgument( that[ k ], this[ k ] );
		}

		this.extra = this.extra || {};

		if ( Object.prototype.hasOwnProperty.call( that, "plainText" ) ) {
			this.extra.plainText = !!that.plainText;
		}

		if ( Object.prototype.hasOwnProperty.call( that, "isNotice" ) ) {
			this.extra.isNotice = !!that.isNotice;
		}
	}

	public static parseUID( u: string ) {
		let client: string = null, id: string = null, uid: string = null;
		if ( u ) {
			const s = u.toString();
			const i = s.indexOf( "/" );

			if ( i !== -1 ) {
				client = s.slice( 0, Math.max( 0, i ) ).toLowerCase();
				if ( clientFullNames[ client ] ) {
					client = clientFullNames[ client ];
				}

				id = s.slice( i + 1 ).toLowerCase();
				uid = `${ client.toLowerCase() }/${ id }`;
			}
		}
		return { client, id, uid };
	}

	public static setHandlers( handlers: PluginManager[ "handlers" ] ) {
		// 取得用戶端簡稱所對應的全稱
		clientFullNames = {};
		for ( const [ type, handler ] of handlers ) {
			clientFullNames[ handler.id.toLowerCase() ] = type;
			clientFullNames[ type.toLowerCase() ] = type;
		}
	}

	public static getUIDFromContext( context: Context, id: number | string ) {
		if ( !context.handler ) {
			return null;
		}

		return `${ context.handler.type.toLowerCase() }/${ id }`;
	}

	public static getUIDFromHandler( handler: MessageHandler, id: number | string ) {
		return `${ handler.type.toLowerCase() }/${ id }`;
	}
}
