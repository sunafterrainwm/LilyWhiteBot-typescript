/*
 * 在其他群組查 IRC 的情況
 */

import winston = require( "winston" );

import type { PluginExport } from "@app/bot.type";
import type { Context } from "@app/lib/handlers/Context";
import type { IRCMessageHandler } from "@app/lib/handlers/IRCMessageHandler";

import type { IBridgeMsgStatic } from "@app/plugins/transport/BridgeMsg";

let BridgeMsg: IBridgeMsgStatic;

declare module "@config/config.type" {
	interface PluginConfigs {
		ircquery: {
			disables?: string[];

			/**
			 * 如果使用，命令會變成 /(prefix)topic、/(prefix)names 等
			 */
			prefix: "irc";
		};
	}
}

let icHandler: IRCMessageHandler = null;

function getChans( context: Context ) {
	const r: string[] = [];
	for ( const c of context.extra.mapto ) {
		const client = BridgeMsg.parseUID( c );
		if ( client.client === "IRC" ) {
			r.push( client.id );
		}
	}
	return r;
}

function processWhois( context: Context ) {
	if ( context.param ) {
		icHandler.whois( context.param ).then( function ( info ) {
			let output = [ `${ info.nick }: Unknown nick` ];

			if ( info.user ) {
				output = [
					`${ info.nick } (${ info.user }@${ info.host })`,
					`Server: ${ info.server } (${ info.serverinfo })`
				];

				if ( info.realname ) {
					output.push( `Realname: ${ info.realname }` );
				}

				if ( info.account ) {
					output.push( `${ info.nick } ${ info.accountinfo } ${ info.account }` );
				}
			}

			const outputStr = output.join( "\n" );
			winston.debug( `[ircquery] Msg #${ context.msgId } whois: ${ outputStr }` );
			context.reply( outputStr );
		} );
	} else {
		context.reply( "用法：/ircwhois IRC暱称" );
	}
}

function processNames( context: Context ) {
	const chans: string[] = getChans( context );

	for ( const chan of chans ) {
		const users = icHandler.chans[ chan ].users;
		const userlist: string[] = [];

		for ( const user in users ) {
			if ( users[ user ] !== "" ) {
				userlist.push( `(${ users[ user ] })${ user }` );
			} else if ( users[ user ] !== undefined ) {
				userlist.push( user );
			}
		}
		userlist.sort( function ( a: string, b: string ) {
			if ( a.startsWith( "(@)" ) && !b.startsWith( "(@)" ) ) {
				return -1;
			} else if ( b.startsWith( "(@)" ) && !a.startsWith( "(@)" ) ) {
				return 1;
			} else if ( a.startsWith( "(+)" ) && !b.startsWith( "(+)" ) ) {
				return -1;
			} else if ( b.startsWith( "(+)" ) && !a.startsWith( "(+)" ) ) {
				return 1;
			} else {
				return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
			}
		} );

		const outputStr = `Users on ${ chan }: ${ userlist.join( ", " ) }`;
		context.reply( outputStr );
		winston.debug( `[ircquery] Msg #${ context.msgId } names: ${ outputStr }` );
	}
}

function processTopic( context: Context ) {
	const chans = getChans( context );
	for ( const chan of chans ) {
		const topic = icHandler.chans[ chan ].topic;

		if ( topic ) {
			context.reply( `Topic for channel ${ chan }: ${ topic }` );
			winston.debug( `[ircquery] Msg #${ context.msgId } topic: ${ topic }` );
		} else {
			context.reply( `No topic for ${ chan }` );
			winston.debug( `[ircquery] Msg #${ context.msgId } topic: No topic` );
		}
	}
}

const ircquery: PluginExport<"ircquery"> = function ( pluginManager, options ) {
	const bridge = pluginManager.plugins.transport;

	if ( !bridge || !pluginManager.handlers.has( "IRC" ) ) {
		return;
	}

	BridgeMsg = pluginManager.global.BridgeMsg;

	const prefix = options.prefix || "";
	icHandler = pluginManager.handlers.get( "IRC" );

	bridge.addCommand( `/${ prefix }topic`, processTopic, options );
	bridge.addCommand( `/${ prefix }names`, processNames, options );
	bridge.addCommand( `/${ prefix }whois`, processWhois, options );
};

export default ircquery;
