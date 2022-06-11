/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import type { PluginExport } from "@app/bot.type";
import { Context } from "../lib/handlers/Context";
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
	function cEval( msg: Context ) {
		if ( !pluginManager.botAdmins.includes( Context.getUIDFromContext( msg, msg.from ) ) ) {
			winston.info( `[eval] #${ msg.msgId } Fail: Permission Denied.` );
			msg.reply( "Permission Denied." );
			return;
		} else if ( !msg.param ) {
			winston.info( `[eval] #${ msg.msgId } Fail: Nothing to eval.` );
			msg.reply( "Nothing to eval." );
			return;
		}

		winston.info( `[eval] #${ msg.msgId }: ${ msg.param }` );

		const sandbox = vm.createContext( {
			pluginManager,
			context: msg
		} );
		try {
			const result = vm.runInContext( msg.param, sandbox, {
				timeout: 10000,
				breakOnSigint: true
			} );

			msg.reply( String( result ) );
			winston.info( `[eval] #${ msg.msgId } eval result: ${ String( result ) }` );
		} catch ( e ) {
			msg.reply( String( e ) );
			winston.info( `[eval] #${ msg.msgId } error result: ${ e }` );
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for ( const [ _, handler ] of pluginManager.handlers ) {
		handler.addCommand( "eval", cEval );
	}
};

export default evalMod;
