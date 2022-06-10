/*
 * 在 Telegram 群組中使用 /gitpull 來快速更新版本
 */

import child_process = require( "child_process" );
import winston = require( "winston" );

import type { PluginExport } from "@app/bot.type";
import * as uidParser from "@app/lib/uidParser";

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		gitpull: {}
	}
}

const gitpull: PluginExport<"gitpull"> = function ( pluginManager ) {
	const bridge = pluginManager.plugins.transport;
	if ( !bridge ) {
		throw new Error( "gitpull is only available if plugin transport enable." );
	}
	const alluids = pluginManager.botAdmins.map( uidParser.parseUID ).map( ( u ) => u.uid );

	bridge.addCommand( "gitpull", function ( msg ) {
		if ( alluids.includes( msg.from_uid ) ) {
			const rGitpull = child_process.spawnSync( "git", [ "pull" ] );
			if ( rGitpull.status !== 0 ) {
				winston.error( `Fail to run "git pull" (code: ${ rGitpull.status }, signal: ${ rGitpull.signal }): `, rGitpull.error || Buffer.concat( rGitpull.output ).toString( "utf-8" ) );
				msg.reply( `Git Pull: Fail to pull (code: ${ rGitpull.status }, signal: ${ rGitpull.signal }).` );
			}

			const rNpmCi = child_process.spawnSync( "npm", [ "ci" ] );
			if ( rNpmCi.status !== 0 ) {
				winston.error( `Fail to run "npm ci" (code: ${ rNpmCi.status }, signal: ${ rNpmCi.signal }): `, rNpmCi.error || Buffer.concat( rNpmCi.output ).toString( "utf-8" ) );
				msg.reply( `Git Pull: Fail to install dependencies (code: ${ rNpmCi.status }, signal: ${ rNpmCi.signal }).` );
			}

			const rBuild = child_process.spawnSync( "npm", [ "exec", "-c", "grunt" ] );
			if ( rBuild.status !== 0 ) {
				winston.error( `Fail to run "npm exec -c grunt" (code: ${ rBuild.status }, signal: ${ rBuild.signal }): `, rBuild.error || Buffer.concat( rBuild.output ).toString( "utf-8" ) );
				msg.reply( `Git Pull: Fail to build (code: ${ rBuild.status }, signal: ${ rBuild.signal }).` );
			}

			msg.reply( "Git Pull: Success. Server restart now......" );
			// eslint-disable-next-line no-process-exit
			process.exit( 1 );
		}
	} );
};

export default gitpull;
