import { ConfigTS } from "@app/config/config.type";
import path = require( "path" );

/*
 * 機器人的設定檔
 *
 * 請參照註釋進行設定。設定好之後，請將檔案更名為 config.ts
 */
const config: ConfigTS = {
	configVersion: 2,
	IRC: {
		disabled: true, // 設為 true 之後會禁止 IRC 機器人
		bot: {
			server: "irc.libera.chat",
			nick: "",
			userName: "",
			realName: "",
			channels: [
				"#channel1",
				"#channel2"
			],
			autoRejoin: true,
			secure: true,
			port: 6697,
			floodProtection: true,
			floodProtectionDelay: 300,
			sasl: false, // 如果開啟 SASL，那麼需要正確設定前面的 userName 和下面的 sasl_password
			sasl_password: "",
			encoding: "UTF-8"
		},
		options: {
			maxLines: 4, // 一次性容許最多四行訊息（包括因為太長而被迫分割的）

			// 無視所有IRC上名稱為「xxx」+ 「數字」的人
			// 具體表現為不會處理其訊息
			ignore: [
				"zhmrtbot"
			]
		}
	},
	Telegram: {
		disabled: true, // 設為 true 之後會禁止 Telegram 機器人
		bot: {
			token: "", // BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」

			// 代理伺服器。僅支援 HTTPS 代理
			proxy: {
				host: "",
				port: 0
			},

			// 使用 Webhook 模式，參見 https://core.telegram.org/bots/webhooks
			webhook: {
				port: 0, // Webhook 埠，為 0 時不啟用 Webhook
				path: "", // Webhook 路徑
				url: "", // Webhook 最終的完整 URL，可被外部存取，用於呼叫 Telegram 介面自動設定網址
				ssl: {
					certPath: "", // SSL 憑證，為空時使用 HTTP 協定
					keyPath: "", // SSL 金鑰
					caPath: "" // 如使用自簽章憑證，CA 憑證路徑
				}
			},
			apiRoot: "https://api.telegram.org" // Bot API 的根位址，必要的時候可以改成 IP。
		},
		options: {
			// 在其他群組中如何辨識使用者名稱：可取「username」（優先採用使用者名稱） 、
			// 「fullname」（優先採用全名）、「firstname」（優先採用 First Name）
			nickStyle: "username",

			// 無視 Telegram 上 id 為 xxxxxx 的人
			// 負數會嘗試匹配頻道（sender_chat）
			// 具體表現為不會處理其訊息
			ignore: [
				123456789
			]
		}
	},
	Discord: {
		disabled: true, // 設為 true 之後會禁止 Discord 機器人

		bot: {
			token: ""
		},

		options: {
			// 可取「nickname」（使用者暱稱，僅在伺服器有效，否則仍用使用者名稱）、「username」（使用者名稱）、「id」（ID）
			nickStyle: "nickname",

			// 考慮到中國國內網路情況，若 https://cdn.discordapp.com 被封鎖請改成 true（對應 https://media.discordapp.net）
			useProxyURL: false,

			// 轉發時附帶自訂哏圖片，如為否只轉發表情名稱
			relayEmoji: true,

			// 無視 bot 的訊息
			// 若只想無視特定 bot 請用下方的 ignore 代替
			ignoreBot: false,

			// 無視特定 ID 的訊息
			ignore: [
				"465433043549683712" /* zhmrtbot */

				// 請注意以下這種寫法會編譯失敗：
				// 123456780, // TS2322: Type 'number' is not assignable to type 'string'.
			]
		}
	},

	logging: {
		// 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		level: "info",

		// 紀錄檔檔名，如留空則只向螢幕輸出
		logfile: path.join( __dirname, "../logs/run.log" )
	},

	enablePlugins: [
		// 啟用互聯功能，不想禁止互聯的話請勿移除
		"transport",

		// 查詢 Telegram 的各種 ID ，由 groupid-tg 更改而來
		// 可在正式連接之前啟用該套件，然後在 Telegram 群中使用 /groupid 取得ID
		"ids-tg",

		// 允許查詢 IRC 的一些訊息
		"ircquery",

		// 允許向 IRC 發送一些命令（注意，不是 IRC 命令而是給頻道內機器人使用的命令）
		"irccommand",

		// 翻桌
		"pia"
	],

	plugins: {
		transport: {
			groups: [
				// 說明：
				// 1. 可以填任意個群組
				// 2. 群組格式：「irc/#頻道」、「telegram/群組ID」或「discord/頻道ID」
				// 3. 聊天軟體名不區分大小寫，可簡寫為 i、t、d
				// 4. 如果需要，可以加入多個互聯體
				[
					"irc/#test",
					"telegram/-12345678",
					"discord/887654321"
				]
			],

			// 如果希望把同一軟體的多個群組連接到一起，可為不同的群組設定不同的別名，
			// 這樣互聯機器人在轉發訊息時會採用自訂群組名，以防混淆
			aliases: {
				"telegram/-100123456789": "分部",
				"telegram/-100123456788": [
					"简称",
					"本群全称"
				]
			},

			// 如果不希望特定方向的轉發，例如 Telegram 群不向 Discord 轉發，請在下面設定
			disables: {
				"telegram/-12345678": [
					"discord/887654321"
				]
			},

			options: {
				IRC: {
					notify: {
						join: false, // 有人進入頻道是否在其他群發出提醒

						// 有人更名的話是否在其他群組發出提醒，可取
						// 「all」（所有人都提醒）、「onlyactive」（只有說過話的人更名才提醒）、
						// 「none」（不提醒）
						rename: "onlyactive",

						// 有人離開頻道的話是否在其他群組提醒，也可取 all/onlyactive/none
						leave: "onlyactive",

						// 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
						timeBeforeLeave: 600,

						// 頻道更換 Topic 時是否提醒
						topic: true
					},

					// 這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
					// /msg ChanServ SET #頻道 MLOCK -c
					//  轉發機器人的訊息有以下三種格式：
					//  <T> [nick] message
					//  <T> [nick] Re replyto 「repliedmessage」: message
					//  <T> [nick] Fwd fwdfrom: message
					//  （兩群互聯不會出現用於標識軟體的「<T>」）
					//  可用顏色：white、black、navy、green、red、brown、purple、
					//  olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
					colorize: {
						enabled: true, // 是否允許在 IRC 頻道中使用顏色
						broadcast: "green", // < 整行通知的顏色 >
						client: "navy", // 用於標記使用者端「<T>」的顏色
						nick: "colorful", // nick 的顏色。除標準顏色外，亦可設為 colorful
						replyto: "brown", // Re replyto 的顏色
						repliedmessage: "olive", // 被 Re 的訊息的顏色
						fwdfrom: "cyan", // Fwd fwdfrom 的顏色
						linesplit: "silver", // 行分隔符的顏色

						// 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分布均勻，建議使顏色數量為素數（質數）
						nickcolors: [ "green", "blue", "purple", "olive", "pink", "teal", "red" ]
					}
				},
				Telegram: {
					notify: {
						join: true, // 有人加入群組的話是否提醒其他群組
						leave: true, // 有人離開群組的話是否提醒其他群組
						pin: true // 管理員在頻道內 pin message（公告）的時候是否提醒其他群組
					},

					// 轉發「頻道」
					// 此選項不是「轉發『連結頻道』」
					// 由於 Telegram 的頻道 event 與一般的群組 event 不一樣，需要特別指定才能附加
					// 不接受對頻道的雙向轉發，原因是暫無方法檢測監聽到的頻道訊息是不是來自自己
					channelTransport: {
						"telegram/-100123456781": "in", // 將 -100123456781 設成訊息傳入頻道
						"telegram/-100123456782": "in,must-review", // 將 -100123456782 設成訊息傳入頻道並驗證是否為單向互聯
						"telegram/-100123456783": "out", // 將 -100123456783 設成訊息傳出頻道
						"telegram/-100123456784": "out,must-review" // 將 -100123456784 設成訊息傳出頻道並驗證是否為單向互聯
					},

					// 是否轉傳連結的頻道內容
					// 暫不支援單群組啟用及禁用
					forwardChannels: false,

					forwardCommands: true, // 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）

					// 指出在 Telegram 運行的傳話機器人，以便取得訊息中的真實暱稱
					// 目前僅支援 [] 和 <>（包圍暱稱的括弧）
					forwardBots: {
						XiaoT_bot: "[]",
						zhmrtbot: "[]",
						Sakura_fwdbot: "[]",
						orgdigbot: "[]",
						sauketubot: "[]"
					}
				},
				Discord: {
					// 指出在 Discord 運行的傳話機器人，以便取得訊息中的真實暱稱
					// 格式為 "機器人 ID": [ 包圍暱稱的括弧 ]
					// 目前僅支援 [] 和 <>（包圍暱稱的括弧）
					forwardBots: {
						"465433043549683712" /* zhmrtbot */: "[]"
					}
				},
				paeeye: {
					prepend: "//", // 在訊息前面使用「//」會阻止此條訊息向其他群組轉發。留空或省略則禁用本功能
					inline: "--no-fwd", // 在訊息中間使用「--no-fwd」會阻止此條訊息向其他群組轉發。留空或省略則禁用本功能
					regexp: /^\(NOFWD\)/ // 使用 RegExp 。留空或省略則禁用本功能
				},
				messageStyle: {
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
				},

				// 本節用於處理圖片文件
				//
				// 支持以下幾種處理方式：
				//
				// 以下兩個是公共圖床，僅支持圖片，其他類型文件會被忽略：
				// nichi-co：將圖片上傳到 pb.nichi.co 。
				// imgur：將圖片上傳到 imgur.com 。
				// sm.ms：將圖片上傳到 sm.ms 圖床中 。
				//
				// 以下三個需自建服務器：
				// self：將文件保存在自己的服務器中。請確保您的服務器設置正確，URL 能夠正常訪問，否則將無法發送圖片。
				// linx：將文件上傳到一個 linx（https://github.com/andreimarcu/linx-server）服務器中，支持所有文件格式。
				// uguu: 將文件上傳到一個 uguu（https://github.com/nokonoko/Uguu）服務器中。
				//
				// 特別提醒：
				// 1. nichi-co、sm.ms 為個人圖床，資源有限。如果您的聊天群水量很大，請選擇其他圖床或自建服務器。
				// 2. img.vim.cn 已關閉，使用 vim-cn 將會指向 nichi-co
				// 3. 如使用外部圖床，建議您設置自己專用的 User-Agent。
				// 4. 自建服務器請使用 80 或 443 端口（國內服務器需備案），否則圖片可能無法正常轉發。
				servemedia: {
					type: "", // 檔案的處置方式：省略/留空/none、self、nichi-co、imgur、sm.ms、linx、uguu
					cachePath: "", // type 為 self 時有效：快取存放位置
					serveUrl: "", // type 為 self 時有效：檔案 URL 的字首，一般需要以斜線結尾
					linxApiUrl: "", // type 為 linx 時有效：linx API 位址，一般以斜線結尾
					uguuApiUrl: "", // type 為 uguu 時有效：以 /api.php?d=upload-tool 結尾
					imgur: { // type 為 imgur 時有效
						apiUrl: "https://api.imgur.com/3/", // 以斜線結尾
						clientId: "" // 從 imgur 申請到的 client_id
					},
					sizeLimit: 4096, // 檔案最大大小，單位 KiB。0 表示不限制。限制僅對 Telegram 有效
					timeout: 3000, // 上傳逾時時間，單位毫秒，type 為 vim-cn、imgur 等外部圖床時有效
					userAgent: "" // 存取外部圖床時的 User-Agent，如留空則使用預設的 AFC-ICG-BOT/版本號
				}
			}
		},

		ircquery: {
			disables: [ // 不要在這些群組使用
				"telegram/-12345678" // 軟體名（irc/telegram）要寫全而且小寫……
			],

			prefix: "irc" // 如果使用，命令會變成 /irctopic、/ircnames 等
		},

		irccommand: {
			echo: true, // 是否在目前的使用者端顯示命令已傳送

			disables: [ // 不要在這些群組使用
				"telegram/-12345678" // 軟體名（irc/telegram）要寫全而且小寫……
			],

			prefix: "irc" // 如果使用，命令會變成 /irctopic、/ircnames 等
		}
	}
};

export = config;
