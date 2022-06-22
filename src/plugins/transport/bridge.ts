import winston = require( "winston" );

import type { GetChild, Handlers, MessageHandler } from "@app/utiltype";
import type { Context, RawMsg } from "@app/lib/handlers/Context";
import type { TransportConfig, TransportMessageStyle } from "@app/plugins/transport";

import { parseUID } from "@app/lib/uidParser";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

export interface TransportProcessor<N extends string = ""> {
	init( handler: GetChild<Handlers, N, MessageHandler>, config: TransportConfig ): Promise<void>;
	receive( msg: BridgeMsg ): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransportHook<A extends any[] = any[], T = any> = ( ...args: A ) => T | Promise<T>;

export interface TransportHooks extends Record<string, TransportHook> {
	"bridge.receive": ( msg: BridgeMsg ) => void | Promise<void>;
	"bridge.send": ( msg: BridgeMsg ) => void | Promise<void>;
	"bridge.sent": ( msg: BridgeMsg ) => void | Promise<void>;
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
export const hooks2 = new WeakMap<TransportHook, { event: keyof TransportHooks; priority: number; }>();

export const map: TransportMap = {};
export const aliases: TransportAlias = {};

// TODO 独立的命令处理
// let commands = {};

function getBridgeMsg<R extends RawMsg>( msg: Context<R> ): BridgeMsg<R> {
	if ( msg instanceof BridgeMsg ) {
		return msg as BridgeMsg<R>;
	} else {
		return new BridgeMsg( {}, msg );
	}
}

function prepareMsg( msg: BridgeMsg ) {
	// 檢查是否有傳送目標
	const allTargets = map[ msg.to_uid ];
	const targets: string[] = [];
	for ( const t in allTargets ) {
		if ( !allTargets[ t ].disabled ) {
			targets.push( t );
		}
	}

	// 向 msg 中加入附加訊息
	msg.extra.clients = targets.length + 1;
	msg.extra.mapTo = targets;
	if ( msg.to_uid in aliases ) {
		msg.extra.clientName = aliases[ msg.to_uid ];
	} else {
		if ( !msg.handler ) {
			throw new Error( "msg.handler isn't exist." );
		}
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
	if ( !( event in hooks ) ) {
		hooks[ event ] = new Map();
	}
	const m = hooks[ event ];
	if ( typeof func === "function" ) {
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const h = hooks2.get( func )!;
		hooks[ h.event ].delete( h.priority );
		hooks2.delete( func );
	}
}
export function emitHook<V extends keyof TransportHooks>( event: V, ...args: Parameters<TransportHooks[V]> ) {
	let r = Promise.resolve();
	if ( event in hooks ) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _, hook ] of hooks[ event ] ) {
			r = r.then( async function () {
				await hook( ...args );
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
	} catch ( err ) {
		process.nextTick( function () {
			throw err;
		} );
		return false;
	}

	if ( !msg.extra.mapTo ) {
		return false;
	}

	// 全部訊息已傳送 resolve(true)，部分訊息已傳送 resolve(false)；
	// 所有訊息被拒絕傳送 reject()
	// Hook 需自行處理異常
	// 向對應目標的 handler 觸發 exchange
	const promises: Promise<void>[] = [];
	let allResolved = true;
	for ( const t of msg.extra.mapTo ) {
		const msg2 = new BridgeMsg( msg, {
			to_uid: t
		} );
		const new_uid = parseUID( t );
		const client = new_uid.client;

		if ( !client ) {
			winston.warn( `[transport/bridge] <BotTransport> #${ currMsgId } -x-> ${ t }: Client is null` );
			return;
		}

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
		allResolved = false;
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
	return allResolved;
}

export function truncate( str: string, maxLen = 10 ) {
	str = str.replace( /\n/gu, "" );
	if ( str.length > maxLen ) {
		str = str.slice( 0, Math.max( 0, maxLen - 3 ) ) + "...";
	}
	return str;
}

export const defaultMessageStyle: TransportMessageStyle = {
	// 兩群互聯樣式
	simple: {
		message: "[{nick}] {text}",
		reply: "[{nick}] Re {reply_nick} 「{reply_text}」: {text}",
		forward: "[{nick}] Fwd {forward_nick}: {text}",
		action: "* {nick} {text}",
		notice: "< {text} >"
	},
	// 多群互聯樣式
	complex: {
		message: "[{client_short} - {nick}] {text}",
		reply: "[{client_short} - {nick}] Re {reply_nick} 「{reply_text}」: {text}",
		forward: "[{client_short} - {nick}] Fwd {forward_nick}: {text}",
		action: "* {client_short} - {nick} {text}",
		notice: "< {client_full}: {text} >"
	}
};
