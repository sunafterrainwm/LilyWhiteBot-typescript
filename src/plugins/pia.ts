/*
 * 掀桌子
 *
 * 在群組中使用 !pia、!mua 和 !hug （在Telegram群組中使用 /pia、/mua 和 /hug）
 *
 * pia 的故事：
 * 本插件向[##Orz](https://orz.chat/) 群中的 varia 机器人致敬。pia、mua、hug 三个指令源自 varia 机器人，而[中文维基百科聊天频道](https: //t.me/wikipedia_zh_n)成员经常使用 eat，于是也做成了指令。后来，中文维基百科也增加了这几个指令的模板，例如 [{{pia}}](https://zh.wikipedia.org/wiki/Template:Pia)。
 * 于是，中文维基百科其他几个花式 ping 也成为了机器人的指令。
 *
 */

import winston = require( "winston" );

import type { PluginExport } from "@app/utiltype";
import type { Context } from "@app/lib/handlers/Context";

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		pia: {};
	}
}

const piaMap = new Map( [
	[ "pia", "(╯°Д°)╯︵ ~~~~~┻━┻" ],
	[ "mua", "o(*￣3￣)o" ],
	[ "hug", "(つ°ω°)つ" ],
	[ "eat", "🍴（≧□≦）🍴" ],
	[ "drink", "(๑>؂<๑)۶" ],
	[ "hugmua", "(つ*￣3￣)つ" ],
	[ "idk", "╮(￣▽￣)╭" ],
	[ "kick", "(ｏﾟﾛﾟ)┌┛Σ(ﾉ´*ω*`)ﾉ" ],
	[ "panic", "(ﾟДﾟ≡ﾟдﾟ)" ]
] );

const pia: PluginExport<"pia"> = function ( pluginManager ) {
	const bridge = pluginManager.plugins.transport;
	const BridgeMsg = pluginManager.global.BridgeMsg;

	function doPia( context: Context ) {
		const command = context.command;
		const action = (
			String( piaMap.get( command.replace( /^[!#/]/, "" ) ) ) + " " + context.param
		).trim();

		context.reply( action );
		winston.debug( `[pia] Msg #${ context.msgId }: ${ action }` );

		// 如果開啟了互聯，而且是在公開群組中使用本命令，那麼讓其他群也看見掀桌
		if ( bridge && BridgeMsg && !context.isPrivate ) {

			bridge.send( new BridgeMsg( context, {
				text: action,
				isNotice: true
			} ) );
		}
	}

	if ( bridge ) {
		for ( const command of piaMap.keys() ) {
			bridge.addCommand( `${ command }`, doPia );
		}
	} else {
		// 在完全不开启互联的情况下也能使用
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _type, handler ] of pluginManager.handlers ) {
			for ( const command of piaMap.keys() ) {
				handler.addCommand( `${ command }`, doPia );
			}
		}
	}
};

export default pia;
