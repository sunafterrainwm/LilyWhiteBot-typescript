export interface ConfigTS {
	/**
	 * 配置版本
	 */
	configVersion: 2;

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

	clients?: Record<string, unknown> & Partial<ClientConfigs & {
		[ T in keyof ClientConfigs ]: {
			enable: boolean;
		}
	}>;

	/**
	 * Admins who can change bot config
	 */
	botAdmins?: string[];

	plugins?: Record<string, unknown> & Partial<PluginConfigs & {
		[ T in keyof PluginConfigs ]: {
			enable: boolean;
		}
	}>;
}

/**
 * registers client config
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClientConfigs {
	// nothing here.
}

/**
 * registers plugins config
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginConfigs {
	// nothing here.
}
