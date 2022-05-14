#!/usr/bin/env node
// @ts-check
const fs = require( "fs" );
const path = require( "path" );

const from = path.join( __dirname, "..", "src", "plugins" );
const to = path.join( __dirname, "..", "plugins" );

// eslint-disable-next-line no-bitwise
fs.accessSync( from, fs.constants.R_OK | fs.constants.X_OK );
try {
	// eslint-disable-next-line no-bitwise
	fs.accessSync( to, fs.constants.R_OK | fs.constants.W_OK );
} catch ( e ) {
	if ( String( e ).match( "ENOENT" ) ) {
		fs.mkdirSync( to );
	}
}

const plugins = [ ...new Set( fs.readdirSync( from ).map( function ( plugin ) {
	return plugin && plugin.replace( /\.[jt]s$/, "" );
} ) ) ];

console.error( "available plugins:", plugins.join( ", " ) );

plugins.forEach( function ( plugin ) {
	try {
		require.resolve( path.join( to, plugin ) );
	} catch {
		try {
			fs.writeFileSync( path.join( to, `${ plugin }.ts` ), `export { default } from "@app/plugins/${ plugin }";\n` );
			console.log( `Initial plugin "${ plugin }".` );
		} catch ( e ) {
			console.error( `Fail to initial plugin "${ plugin }":`, e );
		}
	}
} );
