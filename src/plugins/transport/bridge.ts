import winston = require( "winston" );

import type { GetChild, handlers, MessageHandler } from "@app/bot.type";
import type { Context, RawMsg } from "@app/lib/handlers/Context";
import type { TransportConfig } from "@app/plugins/transport";

import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

export interface TransportProcessor<N extends string = ""> {
	init( handler: GetChild<handlers, N, MessageHandler>, config: TransportConfig ): Promise<void>;
	receive( msg: BridgeMsg ): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransportHook<A extends any[] = any[], T = any> = ( ...args: A ) => T | Promise<T>;

export interface TransportHooks extends Record<string, TransportHook> {
	"bridge.receive": ( msg: BridgeMsg ) => Promise<void>;
	"bridge.send": ( msg: BridgeMsg ) => Promise<void>;
	"bridge.sent": ( msg: BridgeMsg ) => Promise<void>;
}

export type TransportMap = Record<string, Record<string, {
	disabled?: boolean;
}>>;

export type TransportAlias = Record<string, {
	shortname: string;
	fullname: string;
}>;

export const processors = new Map<string, TransportProcessor>();
export const hooks: Record<string | number, Map<number, TransportHook>> = {};
export const hooks2 = new WeakMap<TransportHook, { event: keyof TransportHooks, priority: number }>();

export const map: TransportMap = {};
export const aliases: TransportAlias = {};

// TODO 独立的命令处理
// let commands = {};

function getBridgeMsg<R extends RawMsg>( msg: Context<R> ): BridgeMsg<R> {
	if ( msg instanceof BridgeMsg ) {
		return msg;
	} else {
		return new BridgeMsg( {}, msg );
	}
}

function prepareMsg( msg: BridgeMsg ) {
	// 檢查是否有傳送目標
	const alltargets = map[ msg.to_uid ];
	const targets = [];
	for ( const t in alltargets ) {
		if ( !alltargets[ t ].disabled ) {
			targets.push( t );
		}
	}

	// 向 msg 中加入附加訊息
	msg.extra.clients = targets.length + 1;
	msg.extra.mapto = targets;
	if ( aliases[ msg.to_uid ] ) {
		msg.extra.clientName = aliases[ msg.to_uid ];
	} else {
		msg.extra.clientName = {
			shortname: msg.handler.id,
			fullname: msg.handler.type
		};
	}

	return emitHook( "bridge.send", msg );
}

export function addProcessor( type: string, processor: TransportProcessor ) {
	processors.set( type, processor );
}

export function deleteProcessor( type: string ) {
	processors.delete( type );
}

export function addHook<V extends keyof TransportHooks>( event: V, func: TransportHooks[ V ], priority = 100 ) {
	// Event:
	// bridge.send：剛發出，尚未準備傳話
	// bridge.receive：已確認目標
	if ( !hooks[ event ] ) {
		hooks[ event ] = new Map();
	}
	const m = hooks[ event ];
	if ( m && typeof func === "function" ) {
		let p = priority;
		while ( m.has( p ) ) {
			p++;
		}
		m.set( p, func );
		hooks2.set( func, { event: event, priority: p } );
	}
}
export function deleteHook( func: TransportHook ) {
	if ( hooks2.has( func ) ) {
		const h = hooks2.get( func );
		hooks[ h.event ].delete( h.priority );
		hooks2.delete( func );
	}
}
export function emitHook<V extends keyof TransportHooks>( event: V, ...args: Parameters<TransportHooks[V]> ) {
	let r = Promise.resolve();
	if ( hooks[ event ] ) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _, hook ] of hooks[ event ] ) {
			r = r.then( function () {
				return hook( ...args );
			} );
		}
	}
	return r;
}

export async function send<R extends RawMsg>( m: BridgeMsg<R> | Context<R> ) {
	const msg = getBridgeMsg<R>( m );

	const currMsgId = msg.msgId;
	winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } ${ msg.from_uid } ---> ${ msg.to_uid }: ${ msg.text }` );
	const extraJson = JSON.stringify( msg.extra );
	if ( extraJson !== "null" && extraJson !== "{}" ) {
		winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } extra: ${ extraJson }` );
	}

	try {
		await prepareMsg( msg );
	} catch {
		return false;
	}

	// 全部訊息已傳送 resolve(true)，部分訊息已傳送 resolve(false)；
	// 所有訊息被拒絕傳送 reject()
	// Hook 需自行處理異常
	// 向對應目標的 handler 觸發 exchange
	const promises = [];
	let allresolved = true;
	for ( const t of msg.extra.mapto ) {
		const msg2 = new BridgeMsg( msg, {
			to_uid: t
		} );
		const new_uid = BridgeMsg.parseUID( t );
		const client = new_uid.client;

		promises.push( emitHook( "bridge.receive", msg2 ).then( function () {
			const processor = processors.get( client );
			if ( processor ) {
				winston.debug( `[transport/bridge] <BotTransport> #${ currMsgId } ---> ${ new_uid.uid }` );
				return processor.receive( msg2 );
			} else {
				winston.debug( `[transport/bridge] <BotTransport> #${ currMsgId } -X-> ${ new_uid.uid }: No processor` );
			}
		} ) );
	}
	try {
		await Promise.all( promises );
	} catch ( e ) {
		allresolved = false;
		winston.error( "[transport/bridge] <BotSend> Rejected: ", e );
	}
	if ( promises.length > 0 ) {
		winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } done.` );
		emitHook( "bridge.sent", msg ).catch( function () {
			// ignore
		} );
	} else {
		winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } has no targets. Ignored.` );
	}
	return allresolved;
}

export function truncate( str: string, maxLen = 10 ) {
	str = str.replace( /\n/gu, "" );
	if ( str.length > maxLen ) {
		str = str.slice( 0, Math.max( 0, maxLen - 3 ) ) + "...";
	}
	return str;
}
