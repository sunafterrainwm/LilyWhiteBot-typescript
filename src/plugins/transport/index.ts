/*
 * 互聯機器人
 */

import winston = require( "winston" );

import type { PluginExport, PluginManager } from "@app/bot.type";
import type { Context } from "@app/lib/handlers/Context";

import * as bridge from "@app/plugins/transport/bridge";
import { BridgeMsg } from "@app/plugins/transport/BridgeMsg";

import * as bridgeCommand from "@app/plugins/transport/command";
import * as bridgeFile from "@app/plugins/transport/file";
import * as bridgePaeeye from "@app/plugins/transport/paeeye";

export {
	TransportAlias,
	TransportHook,
	TransportHooks,
	TransportMap,
	TransportProcessor
} from "@app/plugins/transport/bridge";
export { TransportCommand } from "@app/plugins/transport/command";
export { TransportServemediaBase, TransportServemedia } from "@app/plugins/transport/file";

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

export type IRCColor = "white" | "black" | "navy" | "green" | "red" | "brown" | "purple" | "olive" |
	"yellow" | "lightgreen" | "teal" | "cyan" | "blue" | "pink" | "gray" | "silver";

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
		IRC?: {
			notify: {
				/**
				 * 有人進入頻道是否在其他群發出提醒
				 */
				join?: boolean;

				/**
				 * 有人更名的話是否在其他群組發出提醒，可取
				 * 「"all"」、「true」（所有人都提醒）、「"onlyactive"」（只有說過話的人更名才提醒）、
				 * 「"none"」、「false」（不提醒）
				 */
				rename?: boolean | "all" | "onlyactive" | "none";

				/**
				 * 有人離開頻道的話是否在其他群組提醒，可取
				 * 「"all"」、「true」（所有人都提醒）、「"onlyactive"」（只有說過話的人更名才提醒）、
				 * 「"none"」、「false」（不提醒）
				 */
				leave?: boolean | "all" | "onlyactive" | "none";

				/**
				 * 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
				 */
				timeBeforeLeave?: number;

				/**
				 * 頻道更換 Topic 時是否提醒
				 */
				topic?: boolean;
			};

			/**
			 * 這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
			 *   /msg ChanServ SET #頻道 MLOCK -c
			 *
			 *   轉發機器人的訊息有以下三種格式：
			 *   <T> [nick] message
			 *   <T> [nick] Re replyto 「repliedmessage」: message
			 *   <T> [nick] Fwd fwdfrom: message
			 *
			 *   （兩群互聯不會出現用於標識軟體的「<T>」）
			 *
			 *   可用顏色：white、black、navy、green、red、brown、purple、
			 *   olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
			 */
			colorize: {
				/**
				 * 是否允許在 IRC 頻道中使用顏色
				 */
				enabled: boolean;

				/**
				 * < 整行通知的顏色 >
				 */
				broadcast: IRCColor;

				/**
				 * 用於標記使用者端「<T>」的顏色
				 */
				client: IRCColor;

				/**
				 * nick 的顏色。除標準顏色外，亦可設為 colorful
				 */
				nick: IRCColor | "colorful";

				/**
				 * Re replyto 的顏色
				 */
				replyto: IRCColor;

				/**
				 * nick 的顏色。除標準顏色外，亦可設為 colorful
				 */
				repliedmessage: IRCColor;

				/**
				 * 被 Re 的訊息的顏色
				 */
				fwdfrom: IRCColor;

				/**
				 * 行分隔符的顏色
				 */
				linesplit: IRCColor;

				/**
				 * 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分布均勻，建議使顏色數量為質數
				 */
				nickcolors: IRCColor[];
			};
		};

		Telegram?: {
			notify: {
				join?: boolean;
				leave?: boolean;
				pin?: boolean;
			};

			/**
			 * 互聯頻道的內容
			 * 不接受對頻道的雙向轉發，原因是暫無方法檢測監聽到的頻道訊息是不是來自自己
			 *
			 * * out             -> 傳出頻道內容，如果無此選項此 plugin 不會監聽頻道發布訊息
			 * * out,must-review -> 同時檢查頻道是否有互聯出去，有的話進行單向不轉發防止無限迴圈
			 * * in              -> 傳入內容，僅做為標記供日後 tgApi 變更時使用
			 * * in,must-review  -> 同上
			 */
			channelTransport?: Record<string, "out" | "out,must-review" | "in" | "in,must-review">;

			/**
			 * 是否轉傳頻道內容
			 */
			forwardChannels?: boolean;

			/**
			 * 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）
			 */
			forwardCommands: boolean;

			/**
			 * 下面是其他群裡面互連機器人的名稱。在轉發這些機器人的訊息時，程式會嘗試從訊息中提取出真正的暱稱，
			 * 而不是顯示機器人的名稱。參數「[]」、「<>」指真正發訊息者暱稱兩邊的括號樣式，目前只支援這兩種括號。
			 */
			forwardBots: Record<string, "[]" | "<>">;
		};

		Discord?: {
			/**
			 * 下面是其他群裡面互連機器人的「ID」。在轉發這些機器人的訊息時，程式會嘗試從訊息中提取出真正的暱稱，
			 * 而不是顯示機器人的名稱。格式為 「機器人ID」。
			 * 參數「[]」、「<>」指真正發訊息者暱稱兩邊的括號樣式，目前只支援這兩種括號。
			 */
			forwardBots: Record<string, "[]" | "<>">;
		};

		/**
		 * 留空或省略則禁用本功能
		 */
		paeeye: string | {
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

		/**
		 * 自訂訊息樣式（使用 https://www.npmjs.com/package/string-format 庫實現）
		 * 欄位一覽：
		 * 訊息資訊：from、to、nick、text、client_short、client_full、command、param
		 * 回覆類：reply_nick、reply_text、reply_user
		 * 轉發類：forward_nick、forward_user
		 * 注意：此處的 nick 並不一定是暱稱，具體內容受前面各聊天軟體機器人的 nickStyle 屬性控制。
		 * 例如 Telegram.options.nickStyle 為 fullname 的話，在轉發 Telegram 群訊息時，nick 也會變成全名。
		 */
		messageStyle: {
			/**
			 * 兩群互聯樣式
			 */
			simple: {
				message: string;
				reply: string;
				forward: string;
				action: string;
				notice: string;
			};

			/**
			 * 多群互聯樣式
			 * 備註：client_short 為空字串時會使用 simple 的樣式
			 */
			complex: {
				message: string;
				reply: string;
				forward: string;
				action: string;
				notice: string;
			};
		};

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
	BridgeMsg.setHandlers( pluginManager.handlers );

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
			const client1 = BridgeMsg.parseUID( c1 ).uid;

			if ( client1 ) {
				for ( const c2 of group ) {
					const client2 = BridgeMsg.parseUID( c2 ).uid;
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
		const client1 = BridgeMsg.parseUID( c1 ).uid;

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
				const client2 = BridgeMsg.parseUID( c2 ).uid;
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

	// 處理用戶端別名
	const aliases = options.aliases || {};
	const aliases2 = {};
	for ( const a in aliases ) {
		const cl = BridgeMsg.parseUID( a ).uid;
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

	// 调试日志
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

	// 載入各用戶端的處理程式，並連接到 bridge 中
	for ( const [ type, handler ] of pluginManager.handlers ) {
		const processor: bridge.TransportProcessor = await import( `@app/plugins/transport/processors/${ type }` );
		processor.init( handler, options );
		bridge.addProcessor( type, processor );
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
