/*
 * filter.js 過濾符合特定規則的訊息
 *
 * "filter": {
 *     "filters": [
 *         {
 *             event: "send/receive",       // send：防止訊息發出，receive：防止訊息被接收
 *             from: "regex"
 *         },
 *         {
 *             event: "send/receive",
 *             from: "regex",               // 需要小寫、完整名稱：irc\\/user、telegram\\/userid、qq\\/@qq號
 *             to: "regex",
 *             nick: "regex",
 *             text: "regex",               // 以上均为並列關係
 *             filter_reply: true           // 如果一條訊息回覆了其他訊息，且後者滿足以上條件，則也會被過濾，預設false
 *         },
 *     ]
 * }
 */
import type { PluginExport } from "@app/src/bot.type";
import type { BridgeMsg } from "@app/src/plugins/transport/BridgeMsg";

type RegExpAble = RegExp | string;

export interface Filter {
	/**
	 * * send：防止訊息發出
	 * * receive：防止訊息被接收
	 */
	event: "send" | "receive";

	from: RegExpAble;

	to: RegExpAble;

	nick: RegExpAble;

	text: RegExpAble;

	/**
	 * 如果一條訊息回覆了其他訊息，且後者滿足以上條件，則也會被過濾，預設false
	 */
	filter_reply: boolean;
}

declare module "@app/config/config.type" {
	interface PluginConfigs {
		filter: {
			filters?: Filter[];
			unfilters?: Filter[];
		};
	}
}

const msgfilters: {
    send: {
		filters: Filter[];
		unfilters: Filter[];
	};
    receive: {
		filters: Filter[];
		unfilters: Filter[];
	};
} = {
	send: {
		filters: [],
		unfilters: []
	},
	receive: {
		filters: [],
		unfilters: []
	}
};

function createFilter( f: Filter, type: "filters" | "unfilters" ) {
	let arr: Filter[];
	const opt: Partial<Filter> = {};
	if ( f.event === "receive" ) {
		arr = msgfilters.receive[ type ];
	} else if ( f.event === "send" || !f.event ) {
		arr = msgfilters.send[ type ];
	} else {
		return;
	}

	if ( f.from !== undefined ) {
		opt.from = new RegExp( f.from );
	}
	if ( f.to !== undefined ) {
		opt.to = new RegExp( f.to );
	}
	if ( f.nick !== undefined ) {
		opt.nick = new RegExp( f.nick );
	}
	if ( f.text !== undefined ) {
		opt.text = new RegExp( f.text );
	}

	arr.push( opt as Filter );
}

const filter: PluginExport<"filter"> = function ( pluginManager, options ) {
	const bridge = pluginManager.plugins.transport;

	if ( !bridge ) {
		return;
	}

	for ( const f of ( options.filters || [] ) ) {
		createFilter( f, "filters" );
	}
	for ( const f of ( options.unfilters || [] ) ) {
		createFilter( f, "unfilters" );
	}

	function process( event: "send" | "receive" ) {
		return function ( msg: BridgeMsg ) {
			const filters = msgfilters[ event ];

			let rejects = false;

			for ( const f of filters.filters ) {
				let reject = true, reject_reply = false;
				for ( const prop in f ) {
					if ( !( msg[ prop ] && String( msg[ prop ] ).match( f[ prop ] ) ) ) {
						reject = false;
						break;
					}
				}
				// check the replied message if `filter_reply` flag of the filter is set
				if ( f.filter_reply && msg.extra.reply ) {
					reject_reply = true;
					const reply = {
						from: msg.from_uid,
						to: msg.to_uid,
						text: msg.extra.reply.message,
						nick: msg.extra.reply.nick
					};

					for ( const prop in f ) {
						if ( !( reply[ prop ] && String( reply[ prop ] ).match( f[ prop ] ) ) ) {
							reject_reply = false;
							break;
						}
					}
				}

				rejects = reject || reject_reply;
			}

			for ( const f of filters.unfilters ) {
				let reject = false, reject_reply = false;
				for ( const prop in f ) {
					if ( !( msg[ prop ] && String( msg[ prop ] ).match( f[ prop ] ) ) ) {
						reject = true;
						break;
					}
				}
				// check the replied message if `filter_reply` flag of the filter is set
				if ( f.filter_reply && msg.extra.reply ) {
					const reply = {
						from: msg.from_uid,
						to: msg.to_uid,
						text: msg.extra.reply.message,
						nick: msg.extra.reply.nick
					};

					for ( const prop in f ) {
						if ( !( reply[ prop ] && String( reply[ prop ] ).match( f[ prop ] ) ) ) {
							reject_reply = true;
							break;
						}
					}
				}

				rejects = reject || reject_reply;
			}

			if ( rejects ) {
				return Promise.reject();
			}
		};
	}

	bridge.addHook( "bridge.send", process( "send" ) );
	bridge.addHook( "bridge.receive", process( "receive" ) );
};

export default filter;
