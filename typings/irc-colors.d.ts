// Type definitions for irc-colors v1.5.0 (without `exports.global` type defined support)
// Project: https://github.com/fent/irc-colors.js
// Definitions by: sunafterrainwm <sunafterrainwm@gmail.com>
// Definitions: https://github.com/sunafterrainwm/LilyWhiteBot-typescript/tree/typescript/typings/colors-upd.d.ts

declare module "irc-colors" {
	export type ValidColors =
		| "white"
		| "black"
		| "navy"
		| "green"
		| "red"
		| "brown"
		| "maroon"
		| "purple"
		| "violet"
		| "olive"
		| "yellow"
		| "lightgreen"
		| "lime"
		| "teal"
		| "bluecyan"
		| "cyan"
		| "aqua"
		| "blue"
		| "royal"
		| "pink"
		| "lightpurple"
		| "fuchsia"
		| "gray"
		| "grey"
		| "lightgray"
		| "lightgrey"
		| "silver";

	export type ValidStyles =
		| "normal"
		| "underline"
		| "bold"
		| "italic"
		| "inverse"
		| "strikethrough"
		| "monospace";

		type IRCColor =
			Record<ValidColors, ( str: string ) => string> &
			Record<`bg${ ValidColors }`, ( str: string ) => string> &
			Record<ValidStyles, ( str: string ) => string> &
			{
				rainbow( str: string ): string;
				stripColors( str: string ): string;
				stripStyle( str: string ): string;
				stripColorsAndStyle( str: string ): string;
			};

		const IRCColor: IRCColor;
		export = IRCColor;

}
