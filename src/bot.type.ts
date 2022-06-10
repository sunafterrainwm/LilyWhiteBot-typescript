import type { ConfigTS, PluginConfigs } from "@config/config.type";
import type { MessageHandler } from "@app/lib/handlers/MessageHandler";
import type { IRCConfig } from "@app/lib/handlers/IRCMessageHandler";
import type { TelegramConfig } from "@app/lib/handlers/TelegramMessageHandler";
import type { DiscordConfig } from "@app/lib/handlers/DiscordMessageHandler";

export type { MessageHandler } from "@app/lib/handlers/MessageHandler";
export type { RawMsg, RawMsgMap } from "@app/lib/handlers/Context";

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
	IRC: import( "@app/lib/handlers/IRCMessageHandler" ).IRCMessageHandler;
	Telegram: import( "@app/lib/handlers/TelegramMessageHandler" ).TelegramMessageHandler;
	Discord: import( "@app/lib/handlers/DiscordMessageHandler" ).DiscordMessageHandler;
}

export type handlerClasses = {
	IRC: {
		object: typeof import( "@app/lib/handlers/IRCMessageHandler" ).IRCMessageHandler;
		options: IRCConfig;
	};
	Telegram: {
		object: typeof import( "@app/lib/handlers/TelegramMessageHandler" ).TelegramMessageHandler;
		options: TelegramConfig;
	};
	Discord: {
		object: typeof import( "@app/lib/handlers/DiscordMessageHandler" ).DiscordMessageHandler;
		options: DiscordConfig;
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
	plugins: Partial<PluginManagerPlugins>,
	botAdmins: string[];
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
	Context: typeof import( "@app/lib/handlers/Context" ).Context;
	MessageHandler: typeof import( "@app/lib/handlers/MessageHandler" ).MessageHandler;
}

export interface PluginExport<N extends string> {
	( pluginManager: PluginManager, options: GetChild<PluginConfigs, N, void> ):
		AwaitParam<GetChild<PluginManagerPlugins, N, void>>;
}
