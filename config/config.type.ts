export interface ConfigTS {
	/**
	 * 配置版本
	 */
	configVersion: 2;

	IRC?: {
		/**
		 * 如果需要 IRC 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			server: string;
			/**
			 * IRC 暱稱
			 */
			nick: string;

			userName: string;

			realName: string;
			/**
			 * 需要加入的頻道
			 */
			channels: string[];

			autoRejoin: boolean;

			secure: boolean;

			port: number;

			floodProtection: boolean;

			floodProtectionDelay: number;

			sasl: boolean;

			sasl_password: string;

			encoding: string;
		};

		options: {
			maxLines: number;

			/**
			 * 無視某些成員的訊息
			 */
			ignore?: string[];
		};
	};

	Telegram?: {
		/**
		 * 如果需要 Telegram 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			/**
			 * BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」
			 */
			token: string;

			/**
			 * 如果使用中國國內網路，無法直連 Telegram 伺服器，可通過設定 proxy（僅支援 HTTPS 代理）來翻牆
			 * 或者自行在國外架設 Bot API（api.telegram.org）反向代理伺服器然後修改 apiRoot 的值
			 */
			proxy?: {
				/**
				 * HTTPS 代理伺服器位址
				 */
				host: string;

				/**
				 * HTTPS 代理伺服器埠
				 */
				port: number;
			};

			/**
			 * 使用 Webhook 模式，參見 https://core.telegram.org/bots/webhooks
			 */
			webhook: {
				/**
				 * Webhook 埠，為 0 時不啟用 Webhook
				 */
				port: number;

				/**
				 * Webhook 路徑
				 */
				path?: string;

				/**
				 * Webhook 最終的完整 URL，可被外部存取，用於呼叫 Telegram 介面自動設定網址
				 */
				url?: string;

				ssl?: {
					/**
					 * SSL 憑證，為空時使用 HTTP 協定
					 */
					certPath: string;

					/**
					 * SSL 金鑰
					 */
					keyPath: string;

					/**
					 * 如使用自簽章憑證，CA 憑證路徑
					 */
					caPath: string;
				};
			};

			/**
			 * 無特殊需要的話勿動
			 */
			apiRoot: string;
		};

		options: {
			/**
			 * 在其他群組中如何辨識使用者名稱：可取「username」（優先採用使用者名稱）、
			 * 「fullname」（優先採用全名）、「firstname」（優先採用 First Name）
			 */
			nickStyle: "username" | "fullname" | "firstname";

			/**
			 * 無視某些成員的訊息
			 */
			ignore?: number[];

			parseChannelOrSenderChat?: boolean;
		};
	};

	Discord?: {
		/**
		 * 如果需要 Discord 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			token: string;
		};

		options: {
			/**
			 * 可取「nickname」（使用者暱稱，僅在伺服器有效，否則仍用使用者名稱）、「username」（使用者名稱）、「id」（ID）
			 */
			nickStyle: "nickname" | "username" | "id";

			/**
			 * 考慮到中國國內網路情況，若 https://cdn.discordapp.com 被封鎖請改成 true（對應 https://media.discordapp.net）
			 */
			useProxyURL: boolean;

			/**
			 * 轉發時附帶自訂哏圖片，如為否只轉發表情名稱
			 */
			relayEmoji: boolean;

			/**
			 * 無視 bot 的訊息
			 * 若只想無視特定 bot 請用下方的 ignore 代替
			 */
			ignoreBot?: boolean;

			/**
			 * 無視某些成員的訊息
			 */
			ignore?: string[];
		};
	};

	/**
	 * 系統紀錄檔
	 */
	logging?: {
		/**
		 * 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		 */
		level: "debug" | "info" | "warning" | "error";

		/**
		 * 紀錄檔檔名，如留空則只向螢幕輸出
		 */
		logfile: string;
	};

	enablePlugins?: string[];

	plugins?: Record<string, unknown> & Partial<PluginConfigs>;
}

/**
 * registers plugins config
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginConfigs {
	// nothing here.
}
