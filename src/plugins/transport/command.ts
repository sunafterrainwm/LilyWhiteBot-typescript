/*
 options: {
	 disables: [],
	 enables: [],
	 disallowedClients: [],
	 allowedClients: [],
 }

 callbacks: function
 or
 callbacks: {
	'send': func,
	'receive': func,
	'sent': func,
 }
 */

import winston = require( "winston" );

import type { TransportBridge, TransportConfig } from "@app/plugins/transport";
import type { TransportHook, TransportHooks } from "@app/plugins/transport/bridge";

import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

export type TransportCommand = TransportHook<[BridgeMsg], void>;

export type CommandTS = {
	options: {
		disables: string[],
		enables?: string[]
	},
	callbacks: Record<string, TransportCommand>
};

const commands: Map<string, CommandTS> = new Map();

const clientFullNames = {};
let handlers: TransportBridge[ "handlers" ];
let bridge: TransportBridge;

export function init( _bridge: TransportBridge, _cnf: TransportConfig ) {
	bridge = _bridge;
	handlers = bridge.handlers;

	for ( const [ type, handler ] of handlers ) {
		clientFullNames[ handler.id.toLowerCase() ] = type;
		clientFullNames[ type.toLowerCase() ] = type;
	}

	bridge.addHook( "bridge.send", hook( "send" ) );
	bridge.addHook( "bridge.receive", hook( "receive" ) );
	bridge.addHook( "bridge.sent", hook( "sent" ) );

}

export function addCommand(
	command: string,
	callbacks: Record<string, TransportCommand> | TransportCommand,
	opts: {
		allowedClients?: string[];
		disallowedClients?: string[];
		enables?: string[];
		disables?: string[];
	} = {}
): void {
	let cb: Record<string, TransportCommand>;
	if ( typeof callbacks === "object" ) {
		cb = callbacks;
	} else {
		cb = { sent: callbacks };
	}

	const clients: string[] = [];
	if ( opts.allowedClients ) {
		for ( const client of opts.allowedClients ) {
			clients.push( client.toString().toLowerCase() );
		}
	} else {
		const disallowedClients = [];
		for ( const client of ( opts.disallowedClients || [] ) ) {
			disallowedClients.push( client.toString().toLowerCase() );
		}

		for ( const [ type ] of handlers ) {
			if ( !disallowedClients.includes( type ) ) {
				clients.push( type );
			}
		}
	}

	if ( !commands.has( command ) ) {
		for ( const client of clients ) {
			if ( clientFullNames[ client ] && handlers.has( clientFullNames[ client ] ) ) {
				handlers.get( clientFullNames[ client ] as string ).addCommand( command );
			}
		}
	}

	const options: {
		enables?: string[];
		disables: string[];
	} = {
		disables: []
	};

	if ( opts.enables ) {
		options.enables = [];
		for ( const group of opts.enables ) {
			const client = BridgeMsg.parseUID( group );
			if ( client.uid ) {
				options.enables.push( client.uid );
			}
		}
	} else if ( opts.disables ) {
		for ( const group of opts.disables ) {
			const client = BridgeMsg.parseUID( group );
			if ( client.uid ) {
				options.disables.push( client.uid );
			}
		}
	}

	const cmd = {
		options: options,
		callbacks: cb
	};
	commands.set( command, cmd );
}

export function deleteCommand( command: string ) {
	if ( commands.has( command ) ) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _type, handler ] of handlers ) {
			handler.deleteCommand( command );
		}
		commands.delete( command );
	}
}

export function getCommand( command: string ) {
	return commands.get( command );
}

function getCmd( msg: BridgeMsg ) {
	// Telegram 需要特殊處理
	return commands.get( msg.command );
}

function hook( event: keyof TransportHooks ): ( msg: BridgeMsg ) => Promise<void> {
	return function ( msg: BridgeMsg ): Promise<void> {
		if ( msg.command ) {
			const cmd = getCmd( msg );

			if ( !cmd ) {
				return Promise.resolve();
			}

			const { disables, enables } = cmd.options;
			let func = null;

			// 判斷當前群組是否在處理範圍內
			if ( disables.includes( msg.to_uid ) ) {
				winston.debug( `[transport/command] Msg #${ msg.msgId } command ignored.` );
				return Promise.resolve();
			}

			if ( !enables || ( enables && enables.includes( msg.to_uid ) ) ) { // lgtm [js/trivial-conditional]
				func = cmd.callbacks[ event ];
			}

			if ( func && ( typeof func === "function" ) ) {
				winston.debug( `[transport/command] Msg #${ msg.msgId } command: ${ msg.command }` );
				return func( msg );
			} else {
				return Promise.resolve();
			}
		}
	};
}
