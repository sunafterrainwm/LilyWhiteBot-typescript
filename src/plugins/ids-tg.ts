/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import winston = require( "winston" );

import type { PluginExport } from "@app/utiltype";

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		"ids-tg": {};
	}
}

function getOutPut( value: [ string | false, number ] ) {
	return `${ value[ 0 ] || "User" } ID: "${ value[ 1 ] }"`;
}

function upperCaseFirst( str: string ): string {
	return str.slice( 0, 1 ).toUpperCase() + str.slice( 1 );
}

const ids_tg: PluginExport<"ids-tg"> = function ( pluginManager ) {
	const tg = pluginManager.handlers.get( "Telegram" );
	if ( tg ) {
		tg.addCommand( "thisgroupid", function ( context ) {
			const ctx = context._rawdata;

			let output: string;
			if ( ctx.from.id === ctx.chat.id ) {
				output = `Your ID: <code>${ ctx.from.id }</code>`;
				winston.debug( `[ids-tg] Msg #${ context.msgId }: YourId = ${ ctx.from.id }` );
			} else {
				output = `Group ID: <code>${ ctx.chat.id }</code>`;
				winston.debug( `[ids-tg] Msg #${ context.msgId }: GroupId = ${ ctx.chat.id }` );
			}
			context.reply( output, {
				parse_mode: "HTML"
			} );
		} );

		tg.aliasCommand( "groupid", "thisgroupid" );

		tg.addCommand( "userid", function ( context ) {
			const ctx = context._rawdata;

			let output: string;
			if ( "reply_to_message" in ctx.message && ctx.message.reply_to_message ) {
				if (
					"forward_from" in ctx.message.reply_to_message &&
					ctx.message.reply_to_message.forward_from
				) {
					output = "Forward From " + getOutPut( [ false, ctx.message.reply_to_message.forward_from.id ] );
				} else if (
					"forward_from_chat" in ctx.message.reply_to_message &&
					ctx.message.reply_to_message.forward_from_chat &&
					[ "channel", "group", "supergroup" ].includes( ctx.message.reply_to_message.forward_from_chat.type )
				) {
					output = "Forward From " + getOutPut( [
						upperCaseFirst( ctx.message.reply_to_message.forward_from_chat.type ),
						ctx.message.reply_to_message.forward_from_chat.id
					] );
				} else {
					output = "Reply to " + getOutPut( tg.isTelegramFallbackBot( ctx.message.reply_to_message ) );
				}
			} else {
				output = "Your " + getOutPut( tg.isTelegramFallbackBot( ctx.message ) );
			}
			winston.debug( `[ids-tg] Msg #${ context.msgId }: ${ output }` );
			context.reply( output.replace( /"(-?\d+)"/, "<code>$1</code>" ), {
				parse_mode: "HTML"
			} );
		} );

	}
};

export default ids_tg;
