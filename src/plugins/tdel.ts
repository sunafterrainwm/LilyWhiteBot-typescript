/*
 * 離開群組
 *
 * 請設置 Bot Owner，否則無法使用
 *
 * 設置：
 * "leave-tg": {
 *     "owner": 你的 userid，可通過 groupid-tg 並與 bot 私聊取得
 * }
 */
import winston = require( "winston" );

import type { PluginExport } from "@app/utiltype";
import { parseUID } from "@app/lib/uidParser";
import { Context } from "@app/lib/handlers/Context";

declare module "@config/config.type" {
	interface PluginConfigs {
		// only for fallback
		// eslint-disable-next-line @typescript-eslint/ban-types
		tdel: {};
	}
}

const tdel: PluginExport<"tdel"> = function ( pluginManager ) {
	const tg = pluginManager.handlers.get( "Telegram" );
	const tgAdmins = pluginManager.botAdmins
		.filter( function ( uid ) {
			return parseUID( uid ).client === tg?.type;
		} );

	if ( tg && tgAdmins.length ) {
		tg.addCommand( "tdel", async function ( context ) {
			const ctx = context._rawdata;

			if ( !pluginManager.botAdmins.includes( Context.getUIDFromContext( context, context.from ) ?? "" ) ) {
				winston.info( `[tdel] tg#${ context.msgId } (user: ${ context.from }) Fail: Permission Denied.` );
				context.reply( "Permission Denied." );
				return;
			} else if ( !( "reply_to_message" in ctx.message ) || !ctx.message.reply_to_message ) {
				winston.info( `[tdel] tg#${ context.msgId } (user: ${ context.from }) Fail: Nothing to delete.` );
				context.reply( "Nothing to delete." );
				return;
			} else if ( ctx.message.reply_to_message.from?.id !== tg.me.id ) {
				winston.info( `[tdel] tg#${ context.msgId } (user: ${ context.from }, delmsg: ${ ctx.message.reply_to_message.message_id }) Fail: Not bot's message.` );
				context.reply( "You could only delete bot's message." );
				return;
			} else if ( context.isPrivate ) {
				winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }) Fail: private chat.` );
				context.reply( "Please delete them in yourself." );
				return;
			}

			try {
				await tg.rawClient.telegram.deleteMessage( ctx.chat.id, ctx.message.reply_to_message.message_id );
				winston.info( `[tdel] tg#${ context.msgId } (user: ${ context.from }, delmsg: ${ ctx.message.reply_to_message.message_id }) success.` );

				// try to delete command "/tdel"
				tg.rawClient.telegram.deleteMessage( ctx.chat.id, ctx.message.message_id ).catch( function () {
					// ignore
				} );
			} catch ( err ) {
				winston.error( `[tdel] tg#${ context.msgId } (user: ${ context.from }, delmsg: ${ ctx.message.reply_to_message.message_id }) Fail: `, err );
				context.reply( "Api Error." );
			}
		} );
	}

	const dc = pluginManager.handlers.get( "Discord" );
	const dcAdmins = pluginManager.botAdmins
		.filter( function ( uid ) {
			return parseUID( uid ).client === dc?.type;
		} );

	if ( dc && dcAdmins.length ) {
		dc.addCommand( "tdel", async function ( context ) {
			const msg = context._rawdata;

			if ( !pluginManager.botAdmins.includes( Context.getUIDFromContext( context, context.from ) ?? "" ) ) {
				winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }) Fail: Permission Denied.` );
				context.reply( "Permission Denied." );
				return;
			} else if ( !( "reference" in msg ) || !msg.reference || !msg.reference.messageId || msg.channel.id !== msg.reference.channelId ) {
				winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }) Fail: Nothing to delete.` );
				context.reply( "Nothing to delete." );
				return;
			} else if ( context.isPrivate || !msg.inGuild() ) {
				winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }) Fail: DM channel.` );
				context.reply( "Please delete them in yourself." );
				return;
			}

			try {
				const rMsg = await msg.channel.messages.fetch( msg.reference.messageId );

				if ( rMsg.author.id !== dc.me?.id ) {
					winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }, delmsg: ${ msg.reference.messageId }) Fail: Not bot's message.` );
					context.reply( "You could only delete bot's message." );
					return;
				} else if ( !rMsg.deletable ) {
					winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }, delmsg: ${ msg.reference.messageId }) Fail: rMsg.deletable is faile.` );
					context.reply( "Sorry but bot couldn't delete message." );
				}

				try {
					await rMsg.delete();
					winston.info( `[tdel] dc#${ context.msgId } (user: ${ context.from }, delmsg: ${ msg.reference.messageId }) success.` );

					// try to delete command "/tdel"
					if ( msg.deletable ) {
						msg.delete().catch( function () {
						// ignore
						} );
					}
				} catch ( err ) {
					winston.error( `[tdel] tg#${ context.msgId } (user: ${ context.from }, delmsg: ${ msg.reference.messageId }) Fail: `, err );
					context.reply( "Api Error." );
				}

			} catch ( err ) {
				winston.error( `[tdel] dc#${ context.msgId } (user: ${ context.from }, delmsg: ${ msg.reference.messageId }) Fail at fetch reference message: `, err );
				context.reply( "Api Error." );
			}
		} );
	}
};

export default tdel;
