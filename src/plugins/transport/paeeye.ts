import winston = require( "winston" );

import type { TransportBridge, TransportConfig } from "@app/src/plugins/transport";

export function init( bridge: TransportBridge, cnf: TransportConfig ) {
	bridge.addHook( "bridge.send", function ( msg ) {
		return new Promise<void>( function ( resolve, reject ) {
			const paeeye = cnf.options.paeeye;

			if ( paeeye ) {
				if ( typeof paeeye === "string" ) {
					if (
						msg.text.startsWith( paeeye ) ||
						( msg.extra.reply && msg.extra.reply.message.startsWith( paeeye ) )
					) {
						winston.debug( `[transport/paeeye] #${ msg.msgId }: Ignored.` );
						reject( false );
						return;
					}
				} else {
					if (
						msg.text.startsWith( paeeye.prepend ) ||
						msg.text.includes( paeeye.inline ) ||
						msg.text.match( paeeye.regexp )
					) {
						winston.debug( `[transport/paeeye] #${ msg.msgId }: Ignored.` );
						reject( false );
						return;
					} else if (
						msg.extra.reply &&
						(
							msg.extra.reply.message.startsWith( paeeye.prepend ) ||
							msg.extra.reply.message.includes( paeeye.inline ) ||
							msg.extra.reply.message.match( paeeye.regexp )
						)
					) {
						winston.debug( `[transport/paeeye] #${ msg.msgId }: Ignored.` );
						reject( false );
						return;
					}
				}
			}
			resolve();
		} );
	} );
}
