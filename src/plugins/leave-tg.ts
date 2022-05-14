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

declare module "@config/config.type" {
	interface PluginConfigs {
		"leave-tg": {
			/**
			 * 你的 userid，可通過 groupid-tg 並與 bot 私聊取得
			 */
			owner: number;
		}
	}
}

const leave_tg: PluginExport<"leave-tg"> = function ( pluginManager, options ) {
	const tg = pluginManager.handlers.get( "Telegram" );
	if ( tg ) {
		tg.addCommand( "leave", function ( context ) {
			if ( context.isPrivate ) {
				context.reply( "Can't leave." );
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot can't leave from private chats.` );
			} else if ( options.owner && String( context.from ) === String( options.owner ) ) {
				tg.leaveChat( context.to );
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot has left from ${ context.to }.` );
			} else {
				winston.debug( `[leave-tg] Msg #${ context.msgId }: Bot won't leave due to lack of permissions.` );
			}
		} );
	}
};

export default leave_tg;
