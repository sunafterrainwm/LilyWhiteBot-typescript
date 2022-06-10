/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import type { PluginExport } from "@app/bot.type";
import winston = require( "winston" );
import vm = require( "vm" );

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		"eval": {};
	}
}

const evalMod: PluginExport<"eval"> = function ( pluginManager ) {
	const bridge = pluginManager.plugins?.transport;

	bridge.addCommand( "eval", function ( context ) {
		if ( !pluginManager.botAdmins.includes( context.from_uid ) ) {
			winston.info( `[eval] #${ context.msgId } Fail: Permission Denied.` );
			context.reply( "Permission Denied." );
			return;
		} else if ( !context.param ) {
			winston.info( `[eval] #${ context.msgId } Fail: Nothing to eval.` );
			context.reply( "Nothing to eval." );
			return;
		}

		winston.info( `[eval] #${ context.msgId }: ${ context.param }` );

		const sandbox = vm.createContext( {
			pluginManager,
			bridge,
			context
		} );
		try {
			const result = vm.runInContext( context.param, sandbox, {
				timeout: 10000,
				breakOnSigint: true
			} );

			context.reply( String( result ) );
			winston.info( `[eval] #${ context.msgId } eval result: ${ String( result ) }` );
		} catch ( e ) {
			context.reply( String( e ) );
			winston.info( `[eval] #${ context.msgId } error result: ${ e }` );
		}
	} );
};

export default evalMod;
