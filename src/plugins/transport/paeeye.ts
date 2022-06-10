import winston = require( "winston" );

import type { TransportBridge, TransportConfig } from "@app/plugins/transport";

export type TransportPaeeyeOptions = string | {
	/**
	 * 在訊息前面使用此值會阻止此條訊息向其他群組轉發。
	 */
	prepend?: string;

	/**
	 * 在訊息中間使用此值會阻止此條訊息向其他群組轉發。
	 */
	inline?: string;

	/**
	 * 訊息中與此正規表達式對應會阻止此條訊息向其他群組轉發。
	 */
	regexp?: RegExp;
};

export function init( bridge: TransportBridge, cnf: TransportConfig ) {
	bridge.addHook( "bridge.send", function ( msg ) {
		return new Promise<void>( function ( resolve, reject ) {
			const paeeye: TransportPaeeyeOptions = cnf.options.paeeye;

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
