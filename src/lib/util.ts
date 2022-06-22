import fs = require( "fs" );
import yaml = require( "js-yaml" );
import path = require( "path" );
import winston = require( "winston" );

// 用于加载配置文件
export function isFileExists( name: string, dir = path.join( __dirname, "../.." ) ) {
	try {
		fs.accessSync( path.join( dir, name ), fs.constants.R_OK );
		return true;
	} catch ( err ) {
		return false;
	}
}

// 加载配置文件
export function loadConfig<T>( name: string ): T | null {
	const dir = path.join( __dirname, "../../config" );

	// 优先读取 javascript/typescript 格式配置文件
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		return require( `@config/${ name }` ) as T;
	} catch {
		if ( isFileExists( `${ name }.yml`, dir ) ) {
			winston.warn( `* DEPRECATED: ${ name }.yml format is deprecated, please use typescript format instead.` );
			return yaml.load( fs.readFileSync( path.join( dir, `${ name }.yml` ), "utf8" ) ) as T;
		} else if ( isFileExists( `${ name }.yaml`, dir ) ) {
			winston.warn( `* DEPRECATED: ${ name }.yaml format is deprecated, please use typescript format instead.` );
			return yaml.load( fs.readFileSync( path.join( dir, `${ name }.yaml` ), "utf8" ) ) as T;
		} else if ( isFileExists( path.join( dir, `${ name }.json` ), dir ) ) {
			winston.warn( `* DEPRECATED: ${ name }.json format is deprecated, please use typescript format instead.` );
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			return require( path.join( dir, `${ name }.json` ) ) as T;
		} else {
			return null;
		}
	}
}

// 检查已弃用设置
export function checkDeprecatedConfig( object: unknown, keyPath: string, otherWarning = "" ) {
	let current = object;
	const keys = keyPath.split( "." );
	for ( const key of keys ) {
		if (
			current === null ||
			current === undefined ||
			!( key in ( current as Record<string, unknown> ) ) ||
			( current as Record<string, unknown> )[ key ] === null ||
			( current as Record<string, unknown> )[ key ] === undefined
		) {
			return;
		} else {
			current = ( current as Record<string, unknown> )[ key ];
		}
	}
	winston.warn( `* DEPRECATED: Config ${ keyPath } is deprecated. ${ otherWarning }` );
}

export function getFriendlySize( size: number ) {
	if ( size <= 1126 ) {
		return `${ size.toLocaleString() } B`;
	} else if ( size <= 1153433 ) {
		return `${ ( size / 1024 ).toLocaleString() } KB`;
	} else if ( size <= 1181116006 ) {
		return `${ ( size / 1048576 ).toLocaleString() } MB`;
	} else {
		return `${ ( size / 1073741824 ).toLocaleString() } GB`;
	}
}

export function getFriendlyLocation( latitude: number, longitude: number ) {
	return `${ latitude < 0 ? `${ -latitude }°S` : `${ latitude }°N` }, ${ longitude < 0 ? `${ -longitude }°W` : `${ longitude }°E` }`;
}
