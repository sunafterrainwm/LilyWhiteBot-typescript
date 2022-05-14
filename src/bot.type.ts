import type { ConfigTS, PluginConfigs } from "@app/config/config.type";
import type { MessageHandler } from "@app/src/lib/handlers/MessageHandler";

export type { MessageHandler } from "@app/src/lib/handlers/MessageHandler";
export type { RawMsg, RawMsgMap } from "@app/src/lib/handlers/Context";

export type GetChild<P, A, F = void> = A extends keyof P ? P[ A ] : F;
export interface ExtendsMap<T extends string, S, M extends Record<T, S>> extends Map<T, S> {
	get<K extends keyof M>( key: K ): GetChild<M, K, S>;
	get( key: string | symbol ): S;
	set<K extends keyof M>( key: K, value: GetChild<M, K, S> ): this;
	set( key: string | symbol, value: S ): this;
}
export type AwaitParam<T> = T | Promise<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MakeCallableConstructor<T extends abstract new ( ...args: any[] ) => any> = Omit<T, "constructor"> & {
	new ( ...args: ConstructorParameters<T> ): InstanceType<T>;
};

export type handlers = {
	IRC: import( "@app/src/lib/handlers/IRCMessageHandler" ).IRCMessageHandler;
	Telegram: import( "@app/src/lib/handlers/TelegramMessageHandler" ).TelegramMessageHandler;
	Discord: import( "@app/src/lib/handlers/DiscordMessageHandler" ).DiscordMessageHandler;
}

export type handlerClasses = {
	IRC: {
		object: typeof import( "@app/src/lib/handlers/IRCMessageHandler" ).IRCMessageHandler;
		options: ConfigTS[ "IRC" ];
	};
	Telegram: {
		object: typeof import( "@app/src/lib/handlers/TelegramMessageHandler" ).TelegramMessageHandler;
		options: ConfigTS[ "IRC" ];
	};
	Discord: {
		object: typeof import( "@app/src/lib/handlers/DiscordMessageHandler" ).DiscordMessageHandler;
		options: ConfigTS[ "IRC" ];
	};
}

export interface PluginManager {
	handlers: ExtendsMap<string, MessageHandler, handlers>,
	handlerClasses: ExtendsMap<string, {
		object: typeof MessageHandler;
		options: Record<string, unknown>;
	// @ts-expect-error TS2344
	}, handlerClasses>,
	config: Partial<ConfigTS>,
	global: PluginManagerGlobal,
	plugins: Partial<PluginManagerPlugins>
}

/**
 * registers plugins
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginManagerPlugins {
	// nothing here.
}

/**
 * global item of pluginManager
 */
export interface PluginManagerGlobal {
	Context: typeof import( "@app/src/lib/handlers/Context" ).Context;
	MessageHandler: typeof import( "@app/src/lib/handlers/MessageHandler" ).MessageHandler;
}

export interface PluginExport<N extends string> {
	( pluginManager: PluginManager, options: GetChild<PluginConfigs, N, void> ):
		AwaitParam<GetChild<PluginManagerPlugins, N, void>>;
}
