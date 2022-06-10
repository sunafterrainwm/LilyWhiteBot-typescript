import type { PluginManager } from "@app/bot.type";

let clientFullNames: Record<string, string> = {};
const clientFullNamesProxy = new Proxy<Record<string, string>>( {}, {
	get( _, key ) {
		return Object.prototype.hasOwnProperty.call( clientFullNames, key ) ?
			clientFullNames[ key as string ] :
			undefined;
	},
	set( _, key, value ) {
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

export function parseUID( u: string ) {
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
