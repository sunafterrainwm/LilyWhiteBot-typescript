import { Context, ContextExtra, ContextOptions, RawMsg } from "@app/lib/handlers/Context";
import { parseUID } from "@app/lib/uidParser";

import type { NotEmptyRequired } from "@app/utiltype";

export interface BridgeMsgOptions<rawdata extends RawMsg> extends ContextOptions<rawdata> {
	plainText?: boolean;
	isNotice?: boolean;
	from_uid?: string;
	to_uid?: string;
	rawFrom?: string;
	rawTo?: string;
}

export type RawDataBridgeMsg<R extends RawMsg = RawMsg> = BridgeMsg<R> & NotEmptyRequired<Pick<BridgeMsg<R>, "_rawdata">>;

export class BridgeMsg<R extends RawMsg = RawMsg> extends Context<R> implements BridgeMsgOptions<R> {
	protected override onSet_from( newVal: string | number | null ) {
		this._from_uid = `${ ( this._from_client || "" ).toLowerCase() }/${ String( newVal ) }`;
	}

	protected override onSet_to( newVal: string | number | null ) {
		this._to_uid = `${ ( this._to_client || "" ).toLowerCase() }/${ String( newVal ) }`;
	}

	private _from_client!: string;
	public get from_client(): string {
		return this._from_client;
	}
	private _to_client!: string;
	public get to_client(): string {
		return this._to_client;
	}

	private _from_uid!: string;
	public get from_uid(): string {
		return this._from_uid;
	}
	public set from_uid( u: string | undefined ) {
		if ( !u ) {
			return;
		}
		const { client, id, uid } = parseUID( u );
		if ( uid ) {
			this._from = id;
			this._from_uid = uid;
			this._from_client = client;
		} else {
			process.nextTick( function () {
				throw new Error( `Uid ${ u } isn't valid.` );
			} );
		}
	}

	private _to_uid!: string;
	public get to_uid(): string {
		return this._to_uid;
	}
	public set to_uid( u: string | undefined ) {
		if ( !u ) {
			return;
		}
		const { client, id, uid } = parseUID( u );
		if ( uid ) {
			this._to = id;
			this._to_uid = uid;
			this._to_client = client;
		} else {
			process.nextTick( function () {
				throw new Error( `Uid ${ u } isn't valid.` );
			} );
		}
	}

	declare public extra: ContextExtra & {
		plainText?: boolean;
		isNotice?: boolean;
	};

	private assign<V>( root: V, ...items: V[] ) {
		items.forEach( function ( item ) {
			for ( const key in item ) {
				root[ key ] = !( [ undefined, null ] as unknown[] ).includes( item[ key ] ) ? item[ key ] : root[ key ];
			}
		} );
		return root;
	}

	// eslint-disable-next-line max-len
	public constructor( context: BridgeMsg<R> | Context<R> | BridgeMsgOptions<R>, overrides: BridgeMsgOptions<R> = {} ) {
		super( context, overrides );

		const that = this.assign( {}, context, overrides ) as BridgeMsgOptions<R>;

		if ( this.handler ) {
			this._from_client = this.handler.type;
			this._to_client = this.handler.type;

			this.from = String( super.from || that.from );
			this.to = String( super.to || that.to );
		}

		for ( const k of [ "from_uid", "to_uid" ] ) {
			type p = "from_uid" | "to_uid";
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this[ k as p ] = Context.getArgument( that[ k as p ], this[ k as p ] )!;
		}

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
