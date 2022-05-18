/*
 * linky - 自動將聊天中的[[]]與{{}}換成 Wiki 系統的連結
 *
 * 配置方法：在 config.ts 中

	plugins 中加入一個「wikilinky」，然後在末尾補一個：

	"wikilinky": {
		"groups": {
			"qq/123123123": "https://zh.wikipedia.org/wiki/$1"
		},
		"ignores": [
			"telegram/777000",
			"irc/wm-bot"
		]
	}
 */

import winston = require( "winston" );
import { Context } from "@app/lib/handlers/Context";

import type { PluginExport } from "@app/bot.type";
import type { TransportBridge } from "@app/plugins/transport";
import type { IBridgeMsgStatic } from "@app/plugins/transport/BridgeMsg";

let BridgeMsg: IBridgeMsgStatic;

interface WikilinkyConfig {
	groups: Record<string, string | false> & {
		/**
		 * 預設狀態
		 */
		default?: string | false;
	};

	/**
	 * 不解析在此名單的uid所發出的訊息
	 */
	ignores?: string[];
}

declare module "@config/config.type" {
	interface PluginConfigs {
		wikilinky: WikilinkyConfig;
	}
}

const map: WikilinkyConfig[ "groups" ] = {};

let ignores: string[];

function linky( string: string, articlepath: string ) {
	const text: Record<string, true> = {}; // 去重複

	const ret: string[] = [];

	let $m: RegExpMatchArray | null,
		$page: string,
		$section: string,
		$title: string;

	string.replace( /\[\[([^[\]])+?\]\]|{{([^{}]+?)}}/g, function ( $txt ) {
		if ( text[ $txt ] ) {
			return "<token>";
		}

		text[ $txt ] = true;

		$txt = $txt.replace( /^{{\s*(?:subst:|safesubst:)?\s*/, "{{" );

		if ( /^\[\[([^|#]+)(?:#([^|]+))?.*?\]\]$/.exec( $txt ) ) {
			$m = $txt.match( /^\[\[([^|#]+)(?:#([^|]+))?.*?\]\]$/ );
			$page = $m[ 1 ].trim();
			if ( $m[ 2 ] ) {
				$section = "#" + $m[ 2 ].trimRight();
			} else {
				$section = "";
			}
			if ( $page.startsWith( "../" ) ) {
				winston.warn( `Refused parse link like "../": "${ $txt }"` );
				return "<token>";
			}
			$title = ( `${ $page }${ $section }` ).replace( /\s/g, "_" ).replace( /\?/g, "%3F" ).replace( /!$/, "%21" ).replace( /:$/, "%3A" );
		} else if ( /^{{\s*#invoke\s*:/.exec( $txt ) ) {
			$m = $txt.match( /^{{\s*#invoke\s*:\s*([^\s|}]+)\s*(?:\||}})/ );
			$title = `Module:${ $m[ 1 ] }`;
		} else if ( /^{{\s*#(exer|if|ifeq|ifexist|ifexpr|switch|time|language|babel)\s*:/.exec( $txt ) ) {
			$m = $txt.match( /^{{\s*#(exer|if|ifeq|ifexist|ifexpr|switch|time|language|babel)\s*:/ );
			$title = `Help:解析器函数#${ $m[ 1 ] }`;
		} else if ( new RegExp( "^{{\\s*(?:CURRENTYEAR|CURRENTMONTH|CURRENTMONTHNAME|CURRENTMONTHNAMEGEN|" +
			"CURRENTMONTHABBREV|CURRENTDAY|CURRENTDAY2|CURRENTDOW|CURRENTDAYNAME|CURRENTTIME|CURRENTHOUR|CURRENTWEEK|" +
			"CURRENTTIMESTAMP|LOCALYEAR|LOCALMONTH|LOCALMONTHNAME|LOCALMONTHNAMEGEN|LOCALMONTHABBREV|LOCALDAY|LOCALDAY2|" +
			"LOCALDOW|LOCALDAYNAME|LOCALTIME|LOCALHOUR|LOCALWEEK|LOCALTIMESTAMP) .*}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#日期与时间";
		} else if ( new RegExp( "^{{\\s*(?:SITENAME|SERVER|SERVERNAME|DIRMARK|" +
			"DIRECTIONMARK|SCRIPTPATH|CURRENTVERSION|CONTENTLANGUAGE|CONTENTLANG) .*}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#技术元数据";
		} else if ( new RegExp( "^{{\\s*(?:REVISIONID|REVISIONDAY|REVISIONDAY2|REVISIONMONTH|" +
			"REVISIONYEAR|REVISIONTIMESTAMP|REVISIONUSER|PAGESIZE|PROTECTIONLEVEL|DISPLAYTITLE|DEFAULTSORT|DEFAULTSORTKEY|DEFAULTCATEGORYSORT)(:.+?)?}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#技术元数据";
		} else if ( new RegExp( "^{{\\s*(?:NUMBEROFPAGES|NUMBEROFARTICLES|NUMBEROFFILES|NUMBEROFEDITS|NUMBEROFVIEWS|" +
			"NUMBEROFUSERS|NUMBEROFADMINS|NUMBEROFACTIVEUSERS|PAGESINCATEGORY|PAGESINCAT|PAGESINCATEGORY|PAGESINCATEGORY|PAGESINCATEGORY|" +
			"PAGESINCATEGORY|NUMBERINGROUP|NUMBERINGROUP|PAGESINNS|PAGESINNAMESPACE)([:|].+?)?}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#统计";
		} else if ( new RegExp( "^{{\\s*(?:FULLPAGENAME|PAGENAME|BASEPAGENAME|SUBPAGENAME|SUBJECTPAGENAME|" +
			"TALKPAGENAME|FULLPAGENAMEE|PAGENAMEE|BASEPAGENAMEE|SUBPAGENAMEE|SUBJECTPAGENAMEE|TALKPAGENAMEE)(:.+?)?}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#页面标题";
		} else if ( new RegExp( "^{{\\s*(?:NAMESPACE|SUBJECTSPACE|ARTICLESPACE|TALKSPACE|NAMESPACEE|" +
			"SUBJECTSPACEE|TALKSPACEE)(:.+?)?}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#命名空间";
		} else if ( /^{{\s*!\s*}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#其他";
		} else if ( /^{{\s*(localurl|fullurl|filepath|urlencode|anchorencode):.+}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#URL数据";
		} else if ( /^{{\s*ns:\d+\s*}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#命名空间_2";
		} else if ( new RegExp( "^{{\\s*(lc|lcfirst|uc|ucfirst" +
			"|formatnum|#dateformat|#formatdate|padleft|padright|plural):.+}}$"
		).exec( $txt ) ) {
			$title = "Help:魔术字#格式";
		} else if ( /^{{\s*(plural|grammar|gender|int)(:.+)?}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#杂项";
		} else if ( /^{{\s*(msg|raw|msgnw|subst|safesubst)(:.+)?}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#杂项";
		} else if ( /^{{\s*(#language|#special|#tag)(:.+)?}}$/.exec( $txt ) ) {
			$title = "Help:魔术字#杂项";
		} else if ( /^{{\s*([^|]+)(?:|.+)?}}$/.exec( $txt ) ) {
			$m = $txt.match( /^{{\s*([^|]+)(?:|.+)?}}$/ );
			$page = $m[ 1 ].trim();
			$title = `${ $page.startsWith( ":" ) ? $page.replace( /^:/, "" ) : `Template:${ $page }` }`;
		} else {
			return "<token>";
		}

		try {
			ret.push( new URL( articlepath.replace( "$1", $title.trim() ) ).href );
		} catch ( e ) {
			ret.push( articlepath.replace( "$1", $title.trim() ) );
		}
		return "<token>";
	} );

	return ret;
}

function processlinky( context: Context, bridge?: TransportBridge ) {
	try {
		const from_uid = Context.getUIDFromContext( context, context.from );
		const to_uid = Context.getUIDFromContext( context, context.to );

		if ( ignores.includes( from_uid ) ) {
			return;
		}

		const rule = Object.prototype.hasOwnProperty.call( map, to_uid ) ? map[ to_uid ] : map.default;

		if ( rule ) {
			const links = linky( context.text, rule );

			if ( links.length > 0 ) {
				context.reply( links.join( "  " ) );
				// 若互聯且在公開群組調用，則讓其他群也看到連結
				if ( bridge && !context.isPrivate ) {
					bridge.send( new BridgeMsg( context, {
						text: links.join( "  " ),
						isNotice: true
					} ) );
				}
			}
		}
	} catch ( ex ) {

	}
}

const wikilinky: PluginExport<"wikilinky"> = function ( pluginManager, options ) {
	if ( !options ) {
		return;
	}

	const bridge = pluginManager.plugins?.transport;
	if ( bridge ) {
		BridgeMsg = pluginManager.global.BridgeMsg;
	}

	Object.assign( map, options.groups );
	ignores = options.ignores;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for ( const [ _type, handler ] of pluginManager.handlers ) {
		handler.on( "event.message", function ( context ) {
			processlinky( context, bridge );
		} );
	}
};

export default wikilinky;
