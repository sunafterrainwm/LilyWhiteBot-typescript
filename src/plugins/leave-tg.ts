/*
 * 離開群組
 *
 * 請設置 Bot Owner，否則無法使用
 *
 * 設置：
 * "leave-tg": {
 *     "owner": 你的 userid，可通過 groupid-tg 並與 bot 私聊取得
 * }
 */
import winston = require( "winston" );

import type { PluginExport } from "@app/bot.type";
import { parseUID } from "@app/lib/uidParser";

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		"leave-tg": {}
	}
}

const leave_tg: PluginExport<"leave-tg"> = function ( pluginManager ) {
	const tg = pluginManager.handlers.get( "Telegram" );
	const admins = pluginManager.config.botAdmins
		.map( parseUID )
		.filter( function ( ast ) {
			return ast.client === "Telegram";
		} )
		.map( function ( ast ) {
			return ast.uid;
		} );

	if ( tg ) {
		tg.addCommand( "leave", function ( context ) {
			if ( context.isPrivate ) {
				context.reply( "Can't leave." );
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot can't leave from private chats.` );
			} else if ( admins.includes( String( context.from ) ) ) {
				tg.leaveChat( context.to );
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot has left from ${ context.to }.` );
			} else {
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot won't leave due to lack of permissions.` );
			}
		} );
	}
};

export default leave_tg;
