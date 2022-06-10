/*
 * restart.js 偵測檔案變更並重啟
 *
 * require npmjs.org module: chokidar
 *
 * "restart": {
 *     "paths": [
 *         {
 *             type: 'file',
 *             path: 'File_A'
 *         },
 *         {
 *             type: 'folder',
 *             path: 'folder_A'
 *         }
 *     ],
 *     "usePolling": true,
 *     "fullRestart": false // or 'whenFail' / true
 * }
 */

import chokidar = require( "chokidar" );
import fs = require( "fs" );
import path = require( "path" );
import winston = require( "winston" );

import type { PluginExport } from "@app/bot.type";

interface ExitPlugin {
	paths: ( {
		type?: "" | "file" | "folder",
		path: string;
	} )[];
	usePolling?: boolean;
	fullRestart?: boolean | "whenFail"
}

declare module "@config/config.type" {
	interface PluginConfigs {
		exit: ExitPlugin
	}
}

const exit: PluginExport<"exit"> = function ( pluginManager, options ) {
	const exits = [];

	options.paths.forEach( function ( obj ) {
		const isFolder = obj.type === "folder";
		try {
			const stats = fs.statSync( obj.path );
			if ( stats.isDirectory() ) {
				if ( !isFolder ) {
					winston.error( `[exit] Can't watch file "${ path.normalize( obj.path ) }": It is a file.` );
					return;
				}
				exits.push( path.normalize( obj.path ) + path.sep + "**" );
			} else {
				if ( isFolder ) {
					winston.error( `[exit] Can't watch folder "${ path.normalize( obj.path ) }": It is a directory.` );
					return;
				}
				exits.push( path.normalize( obj.path ) );
			}
		} catch ( e ) {
			if ( String( e ).match( "no such file or directory" ) ) {
				winston.warn( `[exit] Can't watch ${ isFolder ? "folder" : "file" } "${ path.normalize( obj.path ) }": It isn't exist.` );
			} else {
				winston.error( `[exit] Can't watch ${ isFolder ? "folder" : "file" } "${ path.normalize( obj.path ) }": `, e );
			}
		}
	} );

	const watcher = chokidar.watch( exits, {
		persistent: true,
		ignoreInitial: false,
		usePolling: options.usePolling
	} );

	watcher
		.on( "ready", function () {
			winston.info( "[restart] chokidar ready." );
		} )
		.on( "error", function ( err ) {
			winston.error( "[restart]", err );
		} )
		.on( "change", async function ( p ) {
			if ( options.fullRestart === true ) {
				winston.warn( `[restart] watching path "${ p }" change, exit.` );
				// eslint-disable-next-line no-process-exit
				process.exit( 1 );
			} else {
				winston.warn( `[restart] watching path "${ p }" change, restart now...` );

				let error = false;

				for ( const [ client, handler ] of pluginManager.handlers ) {
					try {
						await handler.stop();
						await handler.start();
						winston.warn( `[restart] restart client ${ client } success.` );
					} catch ( err ) {
						error = true;
						winston.warn( `[restart] restart client ${ client } fail: ${ err }` );
					}
				}

				if ( error && options.fullRestart === "whenFail" ) {
					winston.warn( "[restart] one or more of client restart fail, exit." );
					// eslint-disable-next-line no-process-exit
					process.exit( 1 );
				}

				winston.warn( "[restart] restart success." );
			}
		} );

	winston.info( `[restart] watching ${ exits.length } path......` );
	winston.info( `[restart] paths: "${ exits.join( '", "' ) }"` );
};

export default exit;
