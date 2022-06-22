/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable max-len, @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
/*!
 * EventEmitter2 6.4.4
 * https://github.com/EventEmitter2/EventEmitter2 commit 7dff2d6a160a636046921256fa4eef9025ae4bf8
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
import NodeJSEventEmitter from "events";

const defaultMaxListeners = 10;

export interface EventEmitterConfig {
	/**
	 * @default '.'
	 * @description the delimiter used to segment namespaces.
	 */
	delimiter?: string;
	/**
	 * @default false
	 * @description set this to `true` if you want to emit the newListener events.
	 */
	newListener?: boolean;
	/**
	 * @default false
	 * @description set this to `true` if you want to emit the removeListener events.
	 */
	removeListener?: boolean;
	/**
	 * @default 10
	 * @description the maximum amount of listeners that can be assigned to an event.
	 */
	maxListeners?: number;
	/**
	 * @default false
	 * @description show event name in memory leak message
	 * when more than maximum amount of listeners is assigned, default false
	 */
	verboseMemoryLeak?: boolean;
	/**
	 * @default false
	 * @description disable throwing uncaughtException if an error event is emitted and it has no listeners
	 */
	ignoreErrors?: boolean;
}

type Func = ( ...args: any[] ) => any;

type EventName = string | symbol;

export type Event = ( ...args: any[] ) => void;

export type Events = Record<EventName, Event>;

export interface ListenerFn extends Event {
	listener?: Event;
	_origin?: Event;
	_async?: boolean;
}

export type EventAndListener = ( event: EventName, ...args: any[] ) => void;

type WaitForFilter<E extends Event = Event> = ( ...values: Parameters<E> ) => boolean;

export interface WaitForOptions<E extends Event = Event> {
	/**
	 * @default null
	 */
	filter: WaitForFilter<E>;
	/**
	 * @default false
	 */
	handleError: boolean;
}

export interface EventEmitterLike {
	addEventListener?: Func;
	removeEventListener?: Func;
	addListener?: Func;
	removeListener?: Func;
	on?: Func;
	off?: Func;
}

export type GeneralEventEmitter = EventEmitterLike & ( {
	addEventListener: Func;
	removeEventListener: Func;
} | {
	addListener: Func;
	removeListener: Func;
} | {
	on: Func;
	off: Func;
} );

export interface OnOptions {
	async?: boolean;
	promisify?: boolean;
	nextTick?: boolean;
	objectify?: boolean;
}

type OnOptions_Objectify = Partial<OnOptions> & {
	objectify: true;
};

type ValueMayUndefined<T> = {
	[ key in keyof T ]: T[ key ] | undefined | null;
};

function resolveOptions<T>( options: Partial<T>, schema: ValueMayUndefined<T>, reducers: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): Partial<T>;
function resolveOptions<T>( options: never, schema: ValueMayUndefined<T>, reducers?: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): Partial<T>;
function resolveOptions<T>( options: Partial<T> | undefined | null | never, schema: ValueMayUndefined<T>, reducers?: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): Partial<T> {
	const computedOptions: ValueMayUndefined<T> = Object.assign( {}, schema );

	if ( !options ) {
		return computedOptions as Partial<T>;
	} else if ( typeof options !== "object" ) {
		throw new TypeError( "options must be an object" );
	}

	const keys: string[] = Object.keys( options );
	const length: number = keys.length;
	let option: PropertyKey, value: any;
	let reducer: ( ( arg0: any, arg1: ( reason: any ) => void ) => any ) | null;

	function reject( reason: string ): void {
		throw new Error( 'Invalid "' + String( option ) + '" option value' + ( reason ? ". Reason: " + reason : "" ) );
	}

	for ( let i = 0; i < length; i++ ) {
		option = keys[ i ];
		if ( !allowUnknown && !Object.prototype.hasOwnProperty.call( schema, option ) ) { // lgtm [js/trivial-conditional]
			throw new Error( 'Unknown "' + option + '" option' );
		}
		value = option in options ? options[ option as keyof T ] : undefined;
		if ( value !== undefined ) {
			reducer = reducers?.[ option as keyof T ] ?? null;
			computedOptions[ option as keyof T ] = typeof reducer === "function" ? reducer( value, reject ) : value;
		}
	}
	return computedOptions as Partial<T>;
}

function functionReducer( func: Func, reject: Func ): void {
	if ( typeof func !== "function" ) {
		reject( "value must be type of function" );
	}
}

class Listener<E extends Events = Events, K extends keyof E = EventName> {
	public emitter: EventEmitter;
	public event: EventName;
	public listener: ListenerFn;

	public constructor( emitter: EventEmitter<E>, event: K, listener: E[ K ] );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFn );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFn ) {
		this.emitter = emitter;
		this.event = event;
		this.listener = listener;
	}

	public off(): this {
		this.emitter.off( this.event, this.listener );
		return this;
	}
}

export default class EventEmitter<E extends Events = Events> implements Required<EventEmitterLike>, NodeJSEventEmitter {
	#conf: EventEmitterConfig;
	#ignoreErrors = false;
	#newListener = false;
	#removeListener = false;
	#verboseMemoryLeak = false;

	#events: Record<string | symbol, ( ListenerFn[] & {
		warned?: boolean;
	} ) | null> = {};
	#all: ListenerFn[] | undefined;
	#maxListeners: number = defaultMaxListeners;

	public constructor( conf?: EventEmitterConfig ) {
		this.#conf = conf ?? {};
		this.#configure();
	}

	#configure(): void {
		if ( this.#conf.delimiter ) {
			this.delimiter = this.#conf.delimiter;
		}

		if ( this.#conf.maxListeners ) {
			this.maxListeners = this.#conf.maxListeners;
		}

		if ( this.#conf.newListener ) {
			this.#newListener = !!this.#conf.newListener;
		}

		if ( this.#conf.removeListener ) {
			this.#removeListener = !!this.#conf.removeListener;
		}

		if ( this.#conf.verboseMemoryLeak ) {
			this.#verboseMemoryLeak = !!this.#conf.verboseMemoryLeak;
		}

		if ( this.#conf.verboseMemoryLeak ) {
			this.#ignoreErrors = !!this.#conf.ignoreErrors;
		}
	}

	public static EventEmitter: typeof EventEmitter = EventEmitter;
	public static EventEmitter2: typeof EventEmitter = EventEmitter;

	// By default EventEmitters will print a warning if more than
	// 10 listeners are added to it. This is a useful default which
	// helps finding memory leaks.
	//
	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	public delimiter = ".";

	public getMaxListeners(): number {
		return this.#maxListeners;
	}
	public setMaxListeners( n: number ): this {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if ( n !== undefined ) {
			this.#maxListeners = n;
			Object.assign( this.#conf, {
				maxListeners: n
			} );
		}

		return this;
	}

	public get maxListeners(): number {
		return this.#maxListeners;
	}
	public set maxListeners( n: number ) {
		this.setMaxListeners( n );
	}

	public event: EventName = "";

	public once<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public once<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#once( event, fn, false, options );
	}

	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#once( event, fn, true, options );
	}

	#once( event: EventName, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, 1, fn, prepend, options );
	}

	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public many( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, ttl, fn, false, options );
	}

	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, ttl, fn, true, options );
	}

	#many( event: EventName, ttl: number, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		const self: this = this;

		if ( typeof fn !== "function" ) {
			throw new Error( "many only accepts instances of Function" );
		}

		function listener( ...args: any ): void {
			if ( --ttl === 0 ) {
				self.off( event, listener );
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return fn( ...args );
		}

		listener._origin = fn;

		return this.#on( event, listener, prepend, options );
	}

	#findPossibleLinters( event: EventName ): ListenerFn[] {
		if ( typeof event !== "string" || event.split( this.delimiter ).length <= 1 ) {
			// need to make copy of handlers because list can change in the middle
			// of emit call
			return ( this.#events[ event ] ?? [] ).slice();
		}

		const that = this;
		const returns: ListenerFn[] = [];
		const cut = event.split( that.delimiter );
		const next: string[] = [];

		while ( cut.length > 0 ) {
			const thisEvent = cut.join( that.delimiter );
			const events = that.#events[ thisEvent ];
			if ( events ) {
				if ( next.length ) {
					events.forEach( function ( fn ) {
						returns.push( function ( ...args ) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
							fn( next.join( that.delimiter ), ...args );
						} );
					} );
				} else {
					returns.push( ...events );
				}
			}
			if ( cut.length ) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				next.unshift( cut.pop()! );
			}
		}

		return returns;
	}

	public emit<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): boolean;
	public emit( type: EventName, ...args: any[] ): boolean;
	public emit( ...args: any[] ): boolean {
		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === "newListener" && !this.#newListener ) {
			if ( !this.#events.newListener ) {
				return false;
			}
		}

		const al: number = arguments.length;
		let handler: ListenerFn[];

		if ( this.#all?.length ) {
			handler = this.#all.slice();

			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				handler[ i ]( ...args );
			}
		}

		handler = this.#findPossibleLinters( type );

		if ( handler.length ) {
			clearArgs = new Array( al - 1 );
			for ( let j = 1; j < al; j++ ) {
				clearArgs[ j - 1 ] = args[ j ];
			}
			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				handler[ i ]( ...clearArgs );
			}
			return true;
		} else if ( !this.#ignoreErrors && !this.#all && type === "error" ) {
			if ( args[ 1 ] instanceof Error ) {
				throw args[ 1 ]; // Unhandled 'error' event
			} else {
				throw Object.assign( new Error( "Uncaught, unspecified 'error' event." ), {
					rawError: args[ 1 ]
				} );
			}
		}

		return !!this.#all;
	}

	public emitAsync<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): Promise<undefined[]>;
	public emitAsync( type: EventName, ...args: any[] ): Promise<undefined[]>;
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	public async emitAsync( ...args: any[] ): Promise<( void | boolean | undefined )[]> {
		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === "newListener" && !this.#newListener ) {
			if ( !this.#events.newListener ) {
				return [ false ];
			}
		}

		const promises: ( Promise<void> | void )[] = [];

		const al = arguments.length;
		let handler: ListenerFn[];

		if ( this.#all ) {
			for ( let i = 0, l = this.#all.length; i < l; i++ ) {
				this.event = type;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				promises.push( this.#all[ i ]( ...args ) );
			}
		}

		handler = this.#events[ type ] ?? [];

		if ( handler.length ) {
			handler = handler.slice();
			clearArgs = new Array( al - 1 );
			for ( let j = 1; j < al; j++ ) {
				clearArgs[ j - 1 ] = args[ j ];
			}
			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				promises.push( handler[ i ]( ...clearArgs ) );
			}
		} else if ( !this.#ignoreErrors && !this.#all && type === "error" ) {
			if ( args[ 1 ] instanceof Error ) {
				throw args[ 1 ]; // Unhandled 'error' event
			} else {
				throw new Error( "Uncaught, unspecified 'error' event." );
			}
		}

		return Promise.all( promises );
	}

	public emitSync!: this[ "emitAsync" ];

	public on<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public on<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public on( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public on( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public on( listener: Event, prepend?: boolean ): this;
	public on( type: EventName | Event, listener?: Event | boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		if ( typeof type === "function" ) {
			this.#onAny( type, !!listener );
			return this;
		} else if ( typeof listener !== "function" ) {
			throw new Error( "onAny only accepts instances of Function" );
		}
		return this.#on( type, listener, false, options );
	}

	// @ts-expect-error TS2416
	public addListener!: this[ "on" ];
	public addEventListener!: this[ "on" ];

	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependListener( event: EventName, fn: Event, options: OnOptions_Objectify ): this;
	public prependListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependListener( type: EventName, listener: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#on( type, listener, true, options );
	}

	public onAny( listener: EventAndListener ): this;
	public onAny( fn: EventAndListener ): this {
		return this.#onAny( fn, false );
	}

	public prependAny( fn: Event ): this;
	public prependAny( fn: Event ): this {
		return this.#onAny( fn, true );
	}

	#onAny( fn: EventAndListener, prepend?: boolean ): this {
		if ( typeof fn !== "function" ) {
			throw new Error( "onAny only accepts instances of Function" );
		}

		if ( !this.#all ) {
			this.#all = [];
		}

		// Add the function to the event listener collection.
		if ( prepend ) {
			this.#all.unshift( fn );
		} else {
			this.#all.push( fn );
		}

		return this;
	}

	#setupListener( event: EventName, listener: ListenerFn, options?: boolean | OnOptions ): [ ListenerFn, Listener | this ] {
		let promisify: boolean | undefined;
		let async: boolean | undefined;
		let nextTick: boolean | undefined;
		let objectify: boolean | undefined;
		const context: EventEmitter = this;

		if ( options === true ) {
			promisify = true;
		} else if ( options === false ) {
			async = true;
		} else {
			if ( !options || typeof options !== "object" ) {
				throw new TypeError( "options should be an object or true" );
			}
			async = options.async;
			promisify = options.promisify;
			nextTick = options.nextTick;
			objectify = options.objectify;
		}

		if ( async || nextTick || promisify ) {
			const _listener: ListenerFn = listener;
			const _origin: Event = listener._origin ?? listener;

			if ( promisify === undefined ) {
				promisify = listener.constructor.name === "AsyncFunction";
			}

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			listener = function ( ...args ): void | Promise<void> {
				// eslint-disable-next-line no-shadow
				const event = context.event;

				return promisify ? (
					nextTick ?
						Promise.resolve() :
						new Promise( function ( resolve ): void {
							setImmediate( resolve );
						} ).then( function (): void {
							context.event = event;
							return _listener.apply( context, args );
						} ) ) :
					process.nextTick( function (): void {
						context.event = event;
						_listener.apply( context, args );
					} );
			};

			listener._async = true;
			listener._origin = _origin;
		}

		return [ listener, objectify ? new Listener( this, event, listener ) : this ];
	}

	#logPossibleMemoryLeak( count: number, eventName: EventName ): void {
		let errorMsg =
			"(node) warning: possible EventEmitter memory leak detected. " + String( count ) + " listeners added. " +
			"Use emitter.setMaxListeners() to increase limit.";

		if ( this.#verboseMemoryLeak ) {
			errorMsg += " Event name: " + String( eventName ) + ".";
		}

		if ( typeof process !== "undefined" && "emitWarning" in process ) {
			const e: Error & {
				emitter?: EventEmitter;
				count?: number;
			} = new Error( errorMsg );
			e.name = "MaxListenersExceededWarning";
			e.emitter = this;
			e.count = count;
			process.emitWarning( e );
		} else {
			console.error( errorMsg );

			if ( "trace" in console ) {
				console.trace();
			}
		}
	}

	#on( type: EventName, listener: Event, prepend?: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		if ( typeof listener !== "function" ) {
			throw new Error( "on only accepts instances of Function" );
		}

		let returnValue: this | Listener = this;

		if ( options !== undefined ) {
			[ listener, returnValue ] = this.#setupListener( type, listener, options );
		}

		// To avoid recursion in the case that type == "newListeners"! Before
		// adding it to the listeners, first emit "newListeners".
		if ( this.#newListener ) {
			this.emit( "newListener", type, listener );
		}

		const event = this.#events[ type ];
		if ( !event || !Array.isArray( this.#events[ type ] ) ) {
			// Optimize the case of one listener. Don't need the extra array object.
			this.#events[ type ] = [ listener ];
		} else {
			// If we've already got an array, just add
			if ( prepend ) {
				event.unshift( listener );
			} else {
				event.push( listener );
			}

			// Check for listener leak
			if (
				!event.warned &&
				this.#maxListeners > 0 &&
				event.length > this.#maxListeners
			) {
				event.warned = true;
				this.#logPossibleMemoryLeak( event.length, type );
			}
		}

		return returnValue;
	}

	public off<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public off( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public off( type: EventName, listener: Event ): this {
		if ( typeof listener !== "function" ) {
			throw new Error( "removeListener only takes instances of Function" );
		}

		let handlers: ListenerFn[];
		const leafs: { _listeners: ListenerFn[]; }[] = [];

		// does not use listeners(), so no side effect of creating _events[type]
		if ( !this.#events[ type ] ) {
			return this;
		}
		handlers = this.#events[ type ] ?? [];
		leafs.push( {
			_listeners: handlers
		} );

		for ( const leaf of leafs ) {
			handlers = leaf._listeners;
			let position = -1;

			for ( let i = 0, length = handlers.length; i < length; i++ ) {
				if ( handlers[ i ] === listener ||
					( handlers[ i ].listener && handlers[ i ].listener === listener ) ||
					( handlers[ i ]._origin && handlers[ i ]._origin === listener ) ) {
					position = i;
					break;
				}
			}

			if ( position < 0 ) {
				continue;
			}

			this.#events[ type ]?.splice( position, 1 );

			if ( handlers.length === 0 ) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete this.#events[ type ];
			}
			if ( this.#removeListener ) {
				this.emit( "removeListener", type, listener );
			}

			return this;
		}

		return this;
	}

	public offAny( fn?: ListenerFn ): this {
		let i = 0, l = 0;
		const fns: ListenerFn[] = this.#all ?? [];
		if ( typeof fn === "function" && this.#all && this.#all.length > 0 ) {
			for ( i = 0, l = fns.length; i < l; i++ ) {
				if ( fn === fns[ i ] ) {
					fns.splice( i, 1 );
					if ( this.#removeListener ) {
						this.emit( "removeListenerAny", fn );
					}
					return this;
				}
			}
		} else {
			if ( this.#removeListener ) {
				for ( i = 0, l = fns.length; i < l; i++ ) {
					this.emit( "removeListenerAny", fns[ i ] );
				}
			}
			this.#all = [];
		}
		return this;
	}

	// @ts-expect-error TS2416
	public removeListener!: this[ "off" ];
	public removeEventListener!: this[ "off" ];

	public removeAllListeners( type?: keyof E ): this;
	public removeAllListeners( type?: EventName ): this;
	public removeAllListeners( type?: EventName ): this {
		if ( type === undefined ) {
			this.#events = {};
			this.#configure();
			return this;
		}

		this.#events[ type ] = null;
		return this;
	}

	public listeners<K extends keyof E>( type: K ): E[K][];
	public listeners( type?: EventName ): ListenerFn[];
	public listeners( type?: EventName ): ListenerFn[] {
		const events = this.#events;
		let keys: EventName[];
		let allListeners: ListenerFn[];
		let i: number;

		if ( type === undefined ) {
			keys = Reflect.ownKeys( events );
			i = keys.length;
			allListeners = [];
			while ( i-- > 0 ) {
				allListeners.push( ...( events[ keys[ i ] ] ?? [] ) );
			}
			return allListeners;
		} else {
			return events[ type ] ?? [];
		}
	}

	public rawListeners<K extends keyof E>( type: K ): E[K][];
	public rawListeners( type: EventName ): ListenerFn[];
	public rawListeners( type: EventName ): ListenerFn[] {
		return this.listeners( type ).map( function ( fn: ListenerFn ) {
			return fn._origin ?? fn.listener ?? fn;
		} );
	}

	public eventNames(): EventName[] {
		return Reflect.ownKeys( this.#events );
	}

	public listenerCount( type: EventName ): number {
		return this.listeners( type ).length;
	}

	public hasListeners( type?: keyof E ): boolean;
	public hasListeners( type?: EventName ): boolean;
	public hasListeners( type?: EventName ): boolean {
		const events = this.#events;
		return typeof type === "undefined" ?
			!!(
				this.#all?.length ??
				Reflect.ownKeys( events ).filter( function ( key ) {
					return Array.isArray( events[ key ] ) && events[ key ]?.length;
				} ).length
			) :
			!!events[ type ];
	}

	public listenersAny(): ListenerFn[] {
		if ( this.#all ) {
			return this.#all;
		} else {
			return [];
		}
	}

	public waitFor<K extends keyof E>( event: K, options: Partial<WaitForOptions<E[K]>> | WaitForFilter<E[K]> ): Promise<Parameters<E[ K ]>>;
	public waitFor( event: EventName, options: Partial<WaitForOptions> | WaitForFilter ): Promise<any>;
	public waitFor( event: EventName, opt: Partial<WaitForOptions> | WaitForFilter ): Promise<any> {
		const self = this;

		let options: Partial<WaitForOptions>;
		if ( typeof opt === "function" ) {
			options = {
				filter: opt
			};
		} else {
			options = opt;
		}

		options = resolveOptions<WaitForOptions>(
			options,
			{
				filter: undefined,
				handleError: false
			},
			{
				filter: functionReducer
			},
			false
		);

		return new Promise( function ( resolve, reject ) {
			function listener( ...args: any[] ) {
				const filter = options.filter;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				if ( filter && !filter( ...args ) ) {
					return;
				}
				self.off( event, listener );
				if ( options.handleError ) {
					const err = args[ 0 ];
					if ( err ) {
						reject( err );
					} else {
						resolve( args.slice( 1 ) );
					}
				} else {
					resolve( args );
				}
			}

			self.#on( event, listener, false );
		} );
	}

	public static once<T extends Events, K extends keyof T>( emitter: EventEmitter<T>, name: K ): Promise<Parameters<T[ K ]>>;
	public static once( emitter: GeneralEventEmitter, name: string ): Promise<any[]>;
	public static once( emitter: GeneralEventEmitter, name: string ): Promise<any[]> {
		return new Promise( function ( resolve, reject ) {
			let handler: Func;
			if ( emitter instanceof EventEmitter ) {
				handler = function ( ...args ) {
					resolve( args );
				};

				emitter.once( name, handler );
				return;
			}

			const on = ( emitter.addEventListener ?? emitter.addListener ?? emitter.on )?.bind( emitter );
			const off = ( emitter.removeEventListener ?? emitter.removeListener ?? emitter.off )?.bind( emitter );

			if ( typeof on === "undefined" || typeof off === "undefined" ) {
				throw new Error( "Can't Find Valid addListener or removeListener on arguments emitter." );
			}

			let ttl = 1;

			function eventListener( ...args: any[] ) {
				if ( --ttl === 0 ) {
					off?.( name, eventListener );
				}

				if ( errorListener ) {
					off?.( "error", errorListener );
				}

				resolve( args );
			}

			let errorListener: ( ( err: any ) => void )| undefined;

			if ( name !== "error" ) {
				let eTtl = 1;

				errorListener = function ( err: any ) {
					if ( --eTtl === 0 ) {
						off( name, errorListener );
					}

					off( name, eventListener );
					reject( err );
				};

				on( "error", errorListener );
			}

			on( name, eventListener );
		} );
	}

	public static get defaultMaxListeners(): number {
		return EventEmitter.prototype.#maxListeners;
	}
	public static set defaultMaxListeners( n: number ) {
		if ( typeof n !== "number" || n < 0 || Number.isNaN( n ) ) {
			throw new TypeError( "n must be a non-negative number" );
		}
		EventEmitter.prototype.#maxListeners = n;
	}
}

/* eslint-disable @typescript-eslint/unbound-method */
EventEmitter.prototype.emitSync = EventEmitter.prototype.emitAsync;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.addEventListener = EventEmitter.prototype.on;
EventEmitter.prototype.removeListener = EventEmitter.prototype.off;
EventEmitter.prototype.removeEventListener = EventEmitter.prototype.off;
/* eslint-enable @typescript-eslint/unbound-method */
