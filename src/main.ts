/* eslint-disable @typescript-eslint/restrict-template-expressions */
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
if ( __filename.endsWith( ".js" ) ) {
	moduleAlias.addAliases( {
		"@app": path.normalize( __dirname ),
		"@package.json": path.join( __dirname, "..", "package.json" ),
		"@config": path.join( __dirname, "..", "config" ),
		"@plugins": path.join( __dirname, "..", "plugins" )
	} );
}
import "@app/references";

import type { ClientConfigs, ConfigTS, PluginConfigs } from "@config/config.type";
import type { MakeCallableConstructor, PluginManager } from "@app/utiltype";

import pkg = require( "@package.json" );
import { Context } from "@app/lib/handlers/Context";
import { MessageHandler } from "@app/lib/handlers/MessageHandler";
import { loadConfig } from "@app/lib/util";
import * as uidParser from "@app/lib/uidParser";

( async function () {
	const allHandlers = new Map<string, string>( [
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
		plugins: {},
		botAdmins: []
	};

	// 日志初始化
	const logFormat = winston.format( function ( info ) {
		info.level = info.level.toUpperCase();
		if ( info.stack ) {
			info.message = `${ info.message }\n${ info.stack as string }`;
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
			winston.format.printf( function ( info ) {
				return `${ info.timestamp as string } [${ info.level }] ${ info.message }`;
			} )
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

	const config: ConfigTS | null = loadConfig( "config" );
	if ( config === null ) {
		winston.error( "No config file found. Exit." );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if ( config.configVersion !== 2 ) {
		winston.error( "You should update config to configVersion 2." );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	}

	// 日志等级、文件设置
	if ( config.logging?.level ) {
		winston.level = config.logging.level;
	} else {
		winston.level = "info";
	}

	if ( config.logging?.logfile ) {
		const files = new winston.transports.File( {
			filename: config.logging.logfile,
			format: winston.format.combine(
				logFormat(),
				winston.format.timestamp( {
					format: "YYYY-MM-DD HH:mm:ss"
				} ),
				winston.format.printf( function ( info ) {
					return `${ info.timestamp as string } [${ info.level }] ${ info.message }`;
				} )
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
		if ( ( ( config.clients?.[ type as keyof ClientConfigs ] || {} ) as { enable?: boolean; } ).enable ) {
			enabledClients.push( type );
		}
	}
	if ( !enabledClients.length ) {
		winston.info( "No client enable, do you miss something?" );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	}
	winston.info( `Enabled clients: ${ enabledClients.join( ", " ) }` );

	for ( const client of enabledClients ) {
		winston.info( `Starting ${ client } bot...` );

		const options = config.clients?.[ client as keyof ClientConfigs ];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const Handler: MakeCallableConstructor<typeof MessageHandler> = ( await import( `@app/lib/handlers/${ allHandlers.get( client ) }` ) ).default;
		const handler = new Handler( options );
		handler.start();

		pluginManager.handlers.set( client, handler );
		pluginManager.handlerClasses.set( client, {
			object: Handler,
			options: options as unknown as Record<string, unknown>
		} );

		winston.info( `${ client } bot has started.` );
	}

	uidParser.setHandlers( pluginManager.handlers );

	pluginManager.botAdmins.push(
		...( config.botAdmins ?? [] )
			.map( uidParser.parseUID )
			.map( function ( ast ) {
				return ast.uid;
			} )
			.filter( function ( uid ) {
				return uid;
			} ) as string[]
	);

	/**
	 * 載入擴充套件
	 */
	winston.info( "" );
	winston.info( "Loading plugins..." );
	pluginManager.config = config;
	let hasLoadPlugin = false;
	for ( const plugin in config.plugins ) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		if ( !( config.plugins[ plugin as keyof PluginConfigs ]as any )?.enable ) {
			winston.error( `Skip plugin: ${ plugin }` );
			continue;
		}
		hasLoadPlugin = true;
		try {
			winston.info( `Loading plugin: ${ plugin }` );
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			const p = await ( ( await import( `@plugins/${ plugin }` ) ).default( pluginManager, config.plugins[ plugin ] || {} ) );
			if ( p ) {
				// @ts-expect-error TS2322
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				pluginManager.plugins[ plugin ] = p;
			} else {
				// @ts-expect-error TS2322
				pluginManager.plugins[ plugin ] = true;
			}
		} catch ( ex ) {
			winston.error( `Error while loading plugin ${ plugin }: `, ex );
		}
	}

	if ( !hasLoadPlugin ) {
		winston.info( "No plugins loaded." );
	}
}() );
