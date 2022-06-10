/*
 * 互聯機器人
 */

import winston = require( "winston" );

import type { PluginExport, PluginManager } from "@app/bot.type";
import type { Context } from "@app/lib/handlers/Context";

import { parseUID } from "@app/lib/uidParser";

import * as bridge from "@app/plugins/transport/bridge";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

import * as bridgeCommand from "@app/plugins/transport/command";
import * as bridgeFile from "@app/plugins/transport/file";
import * as bridgePaeeye from "@app/plugins/transport/paeeye";
import { TransportIRCOptions } from "@app/plugins/transport/processors/IRC";
import { TransportTelegramOptions } from "@app/plugins/transport/processors/Telegram";
import { TransportDiscordOptions } from "@app/plugins/transport/processors/Discord";

export {
	TransportAlias,
	TransportHook,
	TransportHooks,
	TransportMap,
	TransportProcessor
} from "@app/plugins/transport/bridge";
export { TransportCommand } from "@app/plugins/transport/command";
export { TransportServemediaBase, TransportServemedia } from "@app/plugins/transport/file";
export { IRCColor } from "@app/plugins/transport/processors/IRC";

export interface TransportBridge {
	readonly BridgeMsg: typeof BridgeMsg;
	readonly handlers: PluginManager["handlers"];
	readonly map: bridge.TransportMap;
	readonly aliases: bridge.TransportAlias;
	readonly processors: Map<string, bridge.TransportProcessor>;
	addProcessor( type: string, processor: bridge.TransportProcessor ): void;
	deleteProcessor( type: string ): void;
	addHook<V extends keyof bridge.TransportHooks>( event: V, func: bridge.TransportHooks[V], priority?: number ): void;
	deleteHook( func: bridge.TransportHook ): void;
	// eslint-disable-next-line max-len
	emitHook<V extends keyof bridge.TransportHooks>( event: V, ...args: Parameters<bridge.TransportHooks[V]> ): Promise<void>;
	addCommand(
		command: string,
		callbacks: Record<string, bridgeCommand.TransportCommand> | bridgeCommand.TransportCommand,
		opts?: {
			allowedClients?: string[];
			disallowedClients?: string[];
			enables?: string[];
			disables?: string[];
		}
	): void
	deleteCommand( command: string ): void;
	getCommand( command: string ): bridgeCommand.CommandTS;
	send( m: BridgeMsg | Context, bot?: boolean ): Promise<boolean>;
}

type messageStyle = {
	message: string;
	reply: string;
	forward: string;
	action: string;
	notice: string;
};

export type TransportMessageStyle = {
	/**
	 * 兩群互聯樣式
	 */
	simple: messageStyle;

	/**
	 * 多群互聯樣式
	 * 備註：client_short 為空字串時會使用 simple 的樣式
	 */
	complex: messageStyle;
}

export interface TransportConfig {
	/**
	 * 1. 可以填任意個群組
	 * 2. 群組格式：
	 *  * irc/#頻道 例如 irc/#test
	 *  * telegram/-群組ID 例如 telegram/-12345678
	 *  * discord/ID 例如 discord/123123123123
	 * 3. 如果需要，可以加入多個互聯體。例如將兩個 Telegram 分群連接到一起。
	 */
	groups: string[][];

	/**
	 * 如果希望把同一軟體的多個群組連接到一起，可為不同的群組設定不同的別名，
	 * 這樣互聯機器人在轉發訊息時會採用自訂群組名，以免混淆
	 */
	aliases?: Record<string, string | [string, string]>;

	/**
	 * 設定單向轉發/不轉發
	 */
	disables?: Record<string, string[]>;

	options: {
		IRC?: TransportIRCOptions;

		Telegram?: TransportTelegramOptions;

		Discord?: TransportDiscordOptions;

		/**
		 * 留空或省略則禁用本功能
		 */
		paeeye: bridgePaeeye.TransportPaeeyeOptions;

		/**
		 * 自訂訊息樣式（使用 https://www.npmjs.com/package/string-format 庫實現）
		 * 欄位一覽：
		 * 訊息資訊：from、to、nick、text、client_short、client_full、command、param
		 * 回覆類：reply_nick、reply_text、reply_user
		 * 轉發類：forward_nick、forward_user
		 * 注意：此處的 nick 並不一定是暱稱，具體內容受前面各聊天軟體機器人的 nickStyle 屬性控制。
		 * 例如 Telegram.options.nickStyle 為 fullname 的話，在轉發 Telegram 群訊息時，nick 也會變成全名。
		 */
		messageStyle: TransportMessageStyle;

		/**
		 * 本節用於處理圖片檔案
		 *
		 * 支援以下幾種處理方式：
		 *
		 * 以下三個是公共圖床，僅支援圖片，其他類型檔案會被忽略：
		 * vim-cn：將圖片上傳到 img.vim-cn.com。
		 * imgur：將圖片上傳到 imgur.com。
		 * sm.ms：將圖片上傳到 sm.ms 圖床中。
		 *
		 * 以下三個需自建伺服器：
		 * self：將檔案儲存在自己的伺服器中。請確保您的伺服器設定正確，URL 能夠正常存取，否則將無法傳送圖片。
		 * linx：將檔案上傳到一個 linx（https://github.com/andreimarcu/linx-server）伺服器中，支援所有檔案格式。
		 * uguu: 將檔案上傳到一個 uguu（https://github.com/nokonoko/Uguu）伺服器中。
		 *
		 * 特別提醒：
		 * 1. vim-cn、sm.ms 為個人圖床，資源有限。如果您的聊天群水量很大，請選擇其他圖床或自建伺服器。
		 * 2. 如使用外部圖床，建議您設定自己專用的 User-Agent。
		 * 3. 自建伺服器請使用 80 或 443 埠（中國國內伺服器需備案），否則圖片可能無法正常轉發。
		 */
		servemedia: bridgeFile.TransportServemedia;
	};
}

declare module "@app/bot.type" {
	interface PluginManagerPlugins {
		transport?: TransportBridge;
	}

	interface PluginManagerGlobal {
		BridgeMsg?: typeof BridgeMsg;
	}
}

declare module "@config/config.type" {
	interface PluginConfigs {
		transport: TransportConfig;
	}
}

const defaultMessageStyle = {
	simple: {
		message: "[{nick}] {text}",
		reply: "[{nick}] Re {reply_nick} 「{reply_text}」: {text}",
		forward: "[{nick}] Fwd {forward_nick}: {text}",
		action: "* {nick} {text}",
		notice: "< {text} >"
	},
	complex: {
		message: "[{client_short} - {nick}] {text}",
		reply: "[{client_short} - {nick}] Re {reply_nick} 「{reply_text}」: {text}",
		forward: "[{client_short} - {nick}] Fwd {forward_nick}: {text}",
		action: "* {client_short} - {nick} {text}",
		notice: "< {client_full}: {text} >"
	}
};

const transport: PluginExport<"transport"> = async function ( pluginManager, options ) {
	const exports: {
		BridgeMsg?: typeof BridgeMsg;
		handlers?: PluginManager[ "handlers" ];
	} = {};
	exports.BridgeMsg = BridgeMsg;
	exports.handlers = pluginManager.handlers;
	pluginManager.global.BridgeMsg = BridgeMsg;

	/*
	  理清各群之間的關係：根據已知資料，建立一對一的關係（然後將 disable 的關係去除），便於查詢。例如：

		map: {
			'irc/#channel1': {
				'qq/123123123': {
					disabled: false,
				},
				'telegram/-123123123': {
					disabled: false,
				}
			},
			'irc/#channel2': {
				...
			},
			'qq/123123123': {
				'irc/#channel1': {
					disabled: false,
				},
				...
			},
			...
		}
	 */
	const map: TransportBridge[ "map" ] = {};

	const groups: string[][] = options.groups || [];

	for ( const group of groups ) {
		// 建立聯繫
		for ( const c1 of group ) {
			const client1 = parseUID( c1 ).uid;

			if ( client1 ) {
				for ( const c2 of group ) {
					const client2 = parseUID( c2 ).uid;
					if ( !c2 ) {
						winston.warn( `[transport] bad uid "${ c2 }".` );
						break;
					} else if ( client1 === client2 ) {
						continue;
					} else if ( !map[ client1 ] ) {
						map[ client1 ] = {};
					}

					map[ client1 ][ client2 ] = {
						disabled: false
					};
				}
			} else {
				winston.warn( `[transport] bad uid "${ c1 }".` );
			}
		}
	}

	// 移除被禁止的聯繫
	const disables: Record<string, string[]> = options.disables || {};
	for ( const c1 in disables ) {
		const client1 = parseUID( c1 ).uid;

		if ( client1 ) {
			if ( !map[ client1 ] ) {
				winston.warn( `[transport] Fail to disable transport "${ client1 }": key is undefined.` );
				continue;
			}

			let list = disables[ c1 ];

			if ( typeof list === "string" ) {
				list = [ list ];
			}

			for ( const c2 of list ) {
				const client2 = parseUID( c2 ).uid;
				if ( !c2 ) {
					winston.warn( `[transport] bad uid "${ c2 }".` );
					break;
				} else if ( map[ client1 ][ client2 ] ) {
					map[ client1 ][ client2 ].disabled = true;
				} else {
					winston.warn( `[transport] Fail to disable transport "${ client2 }": key is undefined.` );
				}
			}
		} else {
			winston.warn( `[transport] bad uid "${ c1 }".` );
		}
	}

	Object.assign( bridge.map, map );

	// 處理用戶端別名
	const aliases = options.aliases || {};
	const aliases2 = {};
	for ( const a in aliases ) {
		const cl = parseUID( a ).uid;
		if ( cl ) {
			const names = aliases[ a ];
			let shortname: string;
			let fullname: string;

			if ( typeof names === "string" ) {
				shortname = fullname = names;
			} else {
				shortname = names[ 0 ];
				fullname = names[ 1 ] || shortname;
			}

			aliases2[ cl ] = {
				shortname,
				fullname
			};
		}
	}
	Object.assign( bridge.aliases, aliases2 );

	// 默认消息样式
	if ( !options.options.messageStyle ) {
		options.options.messageStyle = defaultMessageStyle;
	}

	// 載入各用戶端的處理程式，並連接到 bridge 中
	for ( const [ type, handler ] of pluginManager.handlers ) {
		const processor: bridge.TransportProcessor = ( await import( `@app/plugins/transport/processors/${ type }` ) ).default;
		processor.init( handler, options );
		bridge.addProcessor( type, processor );
	}

	// 调试日志
	winston.debug( "" );
	winston.debug( "[transport] Bridge Map:" );
	for ( const client1 in map ) {
		for ( const client2 in map[ client1 ] ) {
			if ( map[ client1 ][ client2 ].disabled ) {
				winston.debug( `\t${ client1 } -X-> ${ client2 }` );
			} else {
				winston.debug( `\t${ client1 } ---> ${ client2 }` );
			}
		}
	}

	winston.debug( "" );
	winston.debug( "[transport] Aliases:" );
	let aliasesCount = 0;
	for ( const alias in aliases2 ) {
		winston.debug( `\t${ alias }: ${ aliases2[ alias ].shortname } ---> ${ aliases2[ alias ].fullname }` );
		aliasesCount++;
	}
	if ( aliasesCount === 0 ) {
		winston.debug( "\tNone" );
	}

	const { init: _init, ...commandOutput } = bridgeCommand;
	const outs = Object.assign( {}, bridge, commandOutput, exports ) as TransportBridge;

	// command：允許向互聯群中加跨群操作的命令
	bridgeCommand.init( outs, options );
	// paeeye：不轉發特定開頭的訊息
	bridgePaeeye.init( outs, options );
	// file：處理檔案上傳
	bridgeFile.init( outs, options );

	return outs;
};

export default transport;
