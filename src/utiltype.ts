import type { ConfigTS, PluginConfigs } from "@config/config.type";
import type { MessageHandler } from "@app/lib/handlers/MessageHandler";
import type { IRCConfig } from "@app/lib/handlers/IRCMessageHandler";
import type { TelegramConfig } from "@app/lib/handlers/TelegramMessageHandler";
import type { DiscordConfig } from "@app/lib/handlers/DiscordMessageHandler";

export type { MessageHandler } from "@app/lib/handlers/MessageHandler";
export type { RawMsg, RawMsgMap } from "@app/lib/handlers/Context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructable<T> = abstract new ( ...args: any[] ) => T;

export type GetChild<P, A, F = undefined> = A extends keyof P ? P[ A ] : F;
export interface ExtendsMap<T extends string, S, M = Record<T, S>> extends Map<T, S> {
	get<K extends keyof M>( key: K ): GetChild<M, K, S> | undefined;
	get( key: string | symbol ): S;
	set<K extends keyof M>( key: K, value: GetChild<M, K, S> ): this;
	set( key: string | symbol, value: S ): this;
}
export type AwaitParam<T> = T | Promise<T>;

export type NotEmptyRequired<T> = {
	[ P in keyof T ]-?: Exclude<T[ P ], null | undefined>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MakeCallableConstructor<T extends abstract new ( ...args: any[] ) => any> = Omit<T, "constructor"> & ( new ( ...args: ConstructorParameters<T> ) => InstanceType<T> );

export interface Handlers {
	IRC: import( "@app/lib/handlers/IRCMessageHandler" ).IRCMessageHandler;
	Telegram: import( "@app/lib/handlers/TelegramMessageHandler" ).TelegramMessageHandler;
	Discord: import( "@app/lib/handlers/DiscordMessageHandler" ).DiscordMessageHandler;
}

export interface HandlerClasses {
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
	handlers: ExtendsMap<string, MessageHandler, Handlers>;
	handlerClasses: ExtendsMap<string, {
		object: Constructable<MessageHandler>;
		options: Record<string, unknown>;
	}, HandlerClasses>;
	config: Partial<ConfigTS>;
	global: PluginManagerGlobal;
	// eslint-disable-next-line max-len
	plugins: Partial<PluginManagerPlugins & Omit<Record<keyof PluginConfigs, boolean | undefined>, keyof PluginManagerPlugins>>;
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

export type PluginExport<N extends string> = (
	pluginManager: PluginManager,
	options?: GetChild<PluginConfigs, N>
) => AwaitParam<GetChild<PluginManagerPlugins, N, void>>;
