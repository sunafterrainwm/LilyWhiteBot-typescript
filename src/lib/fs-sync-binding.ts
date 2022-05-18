import fs = require( "fs" );

declare module "fs" {
	export const sync: typeof import( "fs/promises" );
}

Object.defineProperty( fs, "sync", {
	value: require( "fs/promises" )
} );
