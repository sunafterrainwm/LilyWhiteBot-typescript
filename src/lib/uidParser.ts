import type { PluginManager } from "@app/utiltype";

let clientFullNames: Record<string, string> = {};
const clientFullNamesProxy = new Proxy<Record<string, string>>( {}, {
	get( _, key ) {
		return Object.prototype.hasOwnProperty.call( clientFullNames, key ) ?
			clientFullNames[ key as string ] :
			undefined;
	},
	set( _, key, value ) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return
		return ( clientFullNames[ key as string ] = value );
	}
} );

export {
	clientFullNamesProxy as clientFullNames
};

export function setHandlers( handlers: PluginManager[ "handlers" ] ) {
	// 取得用戶端簡稱所對應的全稱
	clientFullNames = {};
	for ( const [ type, handler ] of handlers ) {
		clientFullNames[ handler.id.toLowerCase() ] = type;
		clientFullNames[ type.toLowerCase() ] = type;
	}
}

export interface UidAST {
	client: string;
	id: string;
	uid: string;
}

export interface UidASTNull {
	client: null;
	id: null;
	uid: null;
}

export function parseUID<FORCE = false>( u: string ): FORCE extends true ? UidAST : UidAST | UidASTNull;
export function parseUID( u: string ): UidAST | UidASTNull {
	if ( u ) {
		const s = String( u );
		const i = s.indexOf( "/" );

		if ( i !== -1 ) {
			let client: string;

			client = s.slice( 0, Math.max( 0, i ) ).toLowerCase();
			if ( clientFullNames[ client ] ) {
				client = clientFullNames[ client ];
			}

			const id = s.slice( i + 1 ).toLowerCase();
			const uid = `${ client.toLowerCase() }/${ id }`;

			return { client, id, uid };
		}
	}
	return {
		client: null,
		id: null,
		uid: null
	};
}
