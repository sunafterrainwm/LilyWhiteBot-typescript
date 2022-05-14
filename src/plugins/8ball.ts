/*
 * 8ball
 *
 * 在群組中使用 '8ball （在Telegram群組中使用 /8ball）
 */

import winston = require( "winston" );

import type { Context } from "@app/lib/handlers/Context";
import type { PluginExport } from "@app/bot.type";

import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

const eightballs = [ "As I see it, yes", "It is certain", "It is decidedly so", "Most likely",
	"Outlook good", "Signs point to yes", "One would be wise to think so", "Naturally", "Without a doubt",
	"Yes", "Yes, definitely", "You may rely on it", "Reply hazy, try again", "Ask again later",
	"Better not tell you now", "Cannot predict now", "Concentrate and ask again",
	"You know the answer better than I", "Maybe...", "You're kidding, right?", "Don't count on it",
	"In your dreams", "My reply is no", "My sources say no", "Outlook not so good", "Very doubtful" ];

const eightball: PluginExport<"8ball"> = function ( pluginManager ) {
	const bridge = pluginManager.plugins?.transport;

	function sendEightball( context: Context ) {
		const result = eightballs[ Math.random() * eightballs.length ];

		context.reply( result );
		winston.debug( `[8ball.js] Msg #${ context.msgId } 8ball: ${ result }` );

		if ( bridge && !context.isPrivate ) {
			bridge.send( new BridgeMsg( context, {
				text: `8ball: ${ result }`,
				isNotice: true
			} ) );
		}
	}

	if ( bridge ) {
		bridge.addCommand( "8ball", sendEightball );
	} else {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _type, handler ] of pluginManager.handlers ) {
			handler.addCommand( "8ball", sendEightball );
		}
	}
};

export default eightball;
