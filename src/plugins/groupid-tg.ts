/*
 * 在 Telegram 群組中取得群組的 ID，以便於配置互聯機器人
 */

import winston = require( "winston" );

import type { PluginExport } from "@app/src/bot.type";

import ids_tg from "@app/src/plugins/ids-tg";

const groupid_tg: PluginExport<"groupid-tg"> = function ( pluginManager ) {
	winston.warn( "[groupid-tg] plugin \"groupid-tg\" is deprecated, use \"ids-tg\" instead." );
	return ids_tg( pluginManager );
};

export default groupid_tg;
