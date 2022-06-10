import { Context, ContextExtra, ContextOptin, RawMsg } from "@app/lib/handlers/Context";
import { parseUID } from "@app/lib/uidParser";

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
		const { client, id, uid } = parseUID( u );
		this._from = id;
		this._from_uid = uid;
		this._from_client = client;
	}

	private _to_uid: string;
	public get to_uid(): string {
		return this._to_uid;
	}
	public set to_uid( u: string ) {
		const { client, id, uid } = parseUID( u );
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
}

export type IBridgeMsg<R extends RawMsg = RawMsg> = BridgeMsg<R>;
export type IBridgeMsgStatic = typeof BridgeMsg;
