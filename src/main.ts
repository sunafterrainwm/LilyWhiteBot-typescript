/**
 * LilyWhiteBot
 * https://github.com/mrhso/LilyWhiteBot
 *
 * @author      vjudge1, Ishisashi
 * @description
 */

import moduleAlias = require( "module-alias" );
import path = require( "path" );
import winston = require( "winston" );
moduleAlias.addAliases( {
	"@app": path.join( __dirname, ".." )
} );

import type { ConfigTS } from "@app/config/config.type";
import type { MakeCallableConstructor, PluginManager } from "@app/src/bot.type";

import pkg = require( "@app/package.json" );
import { Context } from "@app/src/lib/handlers/Context";
import { MessageHandler } from "@app/src/lib/handlers/MessageHandler";
import { loadConfig } from "@app/src/lib/util";

( async function () {
	const allHandlers = new Map( [
		[ "IRC", "IRCMessageHandler" ],
		[ "Telegram", "TelegramMessageHandler" ],
		[ "Discord", "DiscordMessageHandler" ]
	] );

	// 所有擴充套件包括傳話機器人都只與該物件打交道
	const pluginManager: PluginManager = {
		handlers: new Map(),
		handlerClasses: new Map(),
		config: {},
		global: {
			Context,
			MessageHandler
		},
		plugins: {}
	};

	// 日志初始化
	const logFormat = winston.format( function ( info ) {
		info.level = info.level.toUpperCase();
		if ( info.stack ) {
			info.message = `${ info.message }\n${ info.stack }`;
		}
		return info;
	} );

	winston.add( new winston.transports.Console( {
		format: winston.format.combine(
			logFormat(),
			winston.format.colorize(),
			winston.format.timestamp( {
				format: "YYYY-MM-DD HH:mm:ss"
			} ),
			winston.format.printf( ( info ) => `${ info.timestamp } [${ info.level }] ${ info.message }` )
		)
	} ) );

	process.on( "unhandledRejection", function ( reason, promise ) {
		promise.catch( function ( e ) {
			winston.error( "Unhandled Rejection: ", e );
		} );
	} );

	process.on( "uncaughtException", function ( err ) {
		winston.error( "Uncaught exception:", err );
	} );

	process.on( "rejectionHandled", function () {
	// 忽略
	} );

	const config: ConfigTS = loadConfig( "config" );
	if ( config === null ) {
		winston.error( "No config file found. Exit." );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	} else if ( config.configVersion !== 2 ) {
		winston.error( "You should update config to configVersion 2." );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	}

	// 日志等级、文件设置
	if ( config.logging && config.logging.level ) {
		winston.level = config.logging.level;
	} else {
		winston.level = "info";
	}

	if ( config.logging && config.logging.logfile ) {
		const files = new winston.transports.File( {
			filename: config.logging.logfile,
			format: winston.format.combine(
				logFormat(),
				winston.format.timestamp( {
					format: "YYYY-MM-DD HH:mm:ss"
				} ),
				winston.format.printf( ( info ) => `${ info.timestamp } [${ info.level }] ${ info.message }` )
			)
		} );
		winston.add( files );
	}

	// 欢迎信息
	winston.info( "LilyWhiteBot: Multi-platform message transport bot." );
	winston.info( `Version: ${ pkg.version }` );
	winston.info( "" );

	// 启动各机器人
	const enabledClients: string[] = [];
	for ( const type of allHandlers.keys() ) {
		if ( config[ type ] && !config[ type ].disabled ) {
			enabledClients.push( type );
		}
	}
	winston.info( `Enabled clients: ${ enabledClients.join( ", " ) }` );

	for ( const client of enabledClients ) {
		winston.info( `Starting ${ client } bot...` );

		const options = config[ client ];
		const Handler: MakeCallableConstructor<typeof MessageHandler> = ( await import( `@app/src/lib/handlers/${ allHandlers.get( client ) }` ) ).default;
		const handler = new Handler( options );
		handler.start();

		pluginManager.handlers.set( client, handler );
		// @ts-expect-error TS2769
		pluginManager.handlerClasses.set( client, {
			object: Handler,
			options: options
		} );

		winston.info( `${ client } bot has started.` );
	}

	/**
	 * 載入擴充套件
	 */
	winston.info( "" );
	winston.info( "Loading plugins..." );
	pluginManager.config = config;
	for ( const plugin of config.enablePlugins ) {
		try {
			winston.info( `Loading plugin: ${ plugin }` );
			const p = await ( ( await import( `@app/src/plugins/${ plugin }` ) ).default( pluginManager, config.plugins[ plugin ] || {} ) );
			if ( p ) {
				pluginManager.plugins[ plugin ] = p;
			} else {
				pluginManager.plugins[ plugin ] = true;
			}
		} catch ( ex ) {
			winston.error( `Error while loading plugin ${ plugin }: `, ex );
		}
	}

	if ( !config.enablePlugins || config.enablePlugins.length === 0 ) {
		winston.info( "No plugins loaded." );
	}
}() );
