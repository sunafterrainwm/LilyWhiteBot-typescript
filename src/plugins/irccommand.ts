/*
 * 在其他群組向 IRC 發命令
 */

import winston = require( "winston" );

import type { PluginExport } from "@app/utiltype";
import { parseUID } from "@app/lib/uidParser";

declare module "@config/config.type" {
	interface PluginConfigs {
		irccommand: {
			/**
			 * 是否在目前的使用者端顯示命令已傳送
			 */
			echo: boolean;

			disables?: string[];

			/**
			 * 如果使用，命令會變成 /(prefix)topic、/(prefix)names 等
			 */
			prefix: string;
		};
	}
}

const irccommand: PluginExport<"irccommand"> = function ( pluginManager, options ) {
	const bridge = pluginManager.plugins.transport;

	if ( !bridge || !pluginManager.handlers.has( "IRC" ) ) {
		return;
	}

	const prefix = options?.prefix ?? "";
	const echo = options?.echo ?? true;
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const ircHandler = pluginManager.handlers.get( "IRC" )!;

	bridge.addCommand( `${ prefix }command`, function ( context ) {
		if ( !context.extra.mapTo ) {
			context.reply( "No destination." );
			winston.debug( `[irccommand] Msg #${ context.msgId }: No destination.` );
			return;
		}
		if ( !context.isPrivate ) {
			if ( context.param ) {
				if ( echo ) {
					context.reply( context.param );
				}

				let sentCount = 0;
				for ( const c of context.extra.mapTo ) {
					const client = parseUID( c );
					if ( client.client === "IRC" ) {
						sentCount++;

						ircHandler.say( client.id, context.param );
						winston.debug( `[irccommand] Msg #${ context.msgId }: IRC command has sent to ${ client.id }. Param = ${ context.param }` );
					}
				}

				if ( sentCount === 0 ) {
					winston.debug( `[irccommand] Msg #${ context.msgId }: No IRC targets.` );
				}
			} else {
				context.reply( `用法: /${ prefix }command <命令>` );
			}
		}
		return Promise.resolve();
	}, Object.assign( options ?? {}, {
		disallowedClients: [ "IRC" ]
	} ) );
};

export default irccommand;
