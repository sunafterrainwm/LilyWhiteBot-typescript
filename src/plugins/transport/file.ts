/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 */

import crypto = require( "crypto" );
import fs = require( "fs" );
import path = require( "path" );
import request = require( "request" );
import sharp = require( "sharp" );
import stream = require( "stream" );
import winston = require( "winston" );

import type { File, UploadFile } from "@app/lib/handlers/Context";
import type { TransportBridge, TransportConfig } from "@app/plugins/transport";

import pkg = require( "@package.json" );

export interface TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type?: "" | "none" | "self" | "vimcn" | "vim-cn" | "imgur" | "sm.ms" | "linx" | "Uguu" | "uguu" | "nichi-co" | "nichico";

	/**
	 * type為self時有效
	 *
	 * 快取存放位置
	 */
	cachePath?: string;

	/**
	 * type為self時有效
	 *
	 * URL 的字首，通常需要以斜線結尾
	 */
	serveUrl?: string;

	/**
	 * type為linx時有效
	 *
	 * linx API 位址（例如 https://www.xxx.com/upload/），通常以斜線結尾
	 */
	linxApiUrl?: string;

	/**
	 * type為uguu時有效
	 *
	 * 請以 /api.php?d=upload-tool 結尾
	 */
	uguuApiUrl?: string;

	/**
	 * type為imgur時有效
	 */
	imgur?: {
		/**
		 * 以斜線結尾
		 */
		apiUrl: string;

		/**
		 * 從 imgur 申請到的 client_id
		 */
		clientId: string;
	};

	/**
	 * 檔案最大大小，單位 KiB。0 表示不限制。限制僅對 Telegram 有效
	 */
	sizeLimit?: number;

	/**
	 * 上傳逾時時間，單位毫秒，type 為 vim-cn、imgur 等外部圖床時有效
	 */
	timeout?: number;

	/**
	 * 存取外部圖床時的 User-Agent，如留空則使用預設的 AFC-ICG-BOT/版本號
	 */
	userAgent?: string;
}

type KeysRequired<T, K extends keyof T> = Pick<Required<T>, K> & Omit<T, K>;

interface TransportServemediaNone extends TransportServemediaBase {
	type?: "" | "none";
}

interface TransportServemediaNichiCo extends TransportServemediaBase {
	type: "vim-cn" | "vimcn" | "nichi-co" | "nichico";
}

interface TransportServemediaSmMs extends TransportServemediaBase {
	type: "sm.ms";
}

interface TransportServemediaSelf extends KeysRequired<TransportServemediaBase, "cachePath" | "serveUrl"> {
	type: "self";
}

interface TransportServemediaLinx extends KeysRequired<TransportServemediaBase, "linxApiUrl"> {
	type: "linx";
}

interface TransportServemediaUguu extends KeysRequired<TransportServemediaBase, "uguuApiUrl"> {
	type: "uguu";
}

interface TransportServemediaImgur extends KeysRequired<TransportServemediaBase, "imgur"> {
	type: "imgur";
}

export type TransportServemedia = |
TransportServemediaNone |
TransportServemediaImgur | TransportServemediaNichiCo | TransportServemediaSmMs |
TransportServemediaSelf | TransportServemediaLinx | TransportServemediaUguu;

let cnf: TransportConfig;
let servemedia: TransportServemedia;

const USERAGENT = `LilyWhiteBot/${ pkg.version } (${ pkg.repository })`;

/**
 * 根据已有文件名生成新文件名
 *
 * @param {string} url
 * @param {string} name 文件名
 * @return {string} 新文件名
 */
function generateFileName( url?: string, name?: string ): string {
	let extName = path.extname( name ?? "" );
	if ( extName === "" ) {
		extName = path.extname( url ?? "" );
	}
	if ( extName === ".webp" ) {
		extName = ".png";
	}
	if ( ![ ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".svg", ".gif", ".pdf", ".mp3", ".mp4", ".tgz" ].includes( extName ) ) {
		extName = ".txt";
	}
	return crypto.createHash( "md5" ).update( name ?? ( Math.random() ).toString() ).digest( "hex" ) + extName;
}

/**
 * 将各聊天软件的媒体类型转成标准类型
 *
 * @param {string} type 各Handler提供的文件类型
 * @return {string} 统一文件类型
 */
function convertFileType( type: string ): string {
	switch ( type ) {
		case "sticker":
			return "photo";
		case "voice":
			return "audio";
		case "video":
		case "document":
			return "file";
		default:
			return type;
	}
}

/**
 * 下载/获取文件内容，对文件进行格式转换（如果需要的话），然后管道出去
 *
 * @param {File} file
 * @return {Promise}
 */
function getFileStream( file: File ): stream.Readable {
	const filePath = file.url ?? file.path ?? "";
	let fileStream: stream.Stream;

	if ( file.url ) {
		fileStream = request.get( file.url );
	} else if ( file.path ) {
		fileStream = fs.createReadStream( file.path );
	} else {
		throw new TypeError( "unknown file type" );
	}

	// Telegram默认使用webp格式，转成png格式以便让其他聊天软件的用户查看
	if ( ( file.type === "sticker" || file.type === "photo" ) && path.extname( filePath ) === ".webp" ) {
		// if (file.type === 'sticker' && servemedia.stickerMaxWidth !== 0) {
		//     // 缩小表情包尺寸，因容易刷屏
		//     fileStream = fileStream.pipe(sharp().resize(servemedia.stickerMaxWidth || 256).png());
		// } else {
		fileStream = fileStream.pipe( sharp().png() );
		// }
	}

	// if (file.type === 'record') {
	//   // TODO: 語音使用silk格式，需要wx-voice解碼
	// }

	return fileStream as stream.Readable;

}

function pipeFileStream<P extends NodeJS.WritableStream>( file: File, pipe: P ) {
	return new Promise<void>( function ( resolve, reject ) {
		const fileStream = getFileStream( file );
		fileStream
			.on( "error", function ( e ) {
				reject( e );
			} )
			.on( "end", function () {
				resolve();
			} )
			.pipe<P>( pipe );
	} );
}

/*
 * 儲存至本機快取
 */
async function uploadToCache( file: File ) {
	const targetName = generateFileName( file.url ?? file.path, file.id );
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const targetPath = path.join( servemedia.cachePath!, targetName );
	const writeStream = fs.createWriteStream( targetPath )
		.on( "error", function ( e ) {
			throw e;
		} );
	await pipeFileStream( file, writeStream );
	return String( servemedia.serveUrl ) + targetName;
}

/*
 * 上传到各种图床
 */
function uploadToHost( file: File ) {
	return new Promise<string>( function ( resolve, reject ) {
		const requestOptions: Partial<request.CoreOptions & request.UrlOptions> = {
			timeout: servemedia.timeout ?? 3000,
			headers: {
				"User-Agent": servemedia.userAgent ?? USERAGENT
			}
		};

		const name = generateFileName( file.url ?? file.path, file.id );

		// p4: reject .exe (complaint from the site admin)
		if ( path.extname( name ) === ".exe" ) {
			reject( "We wont upload .exe file" );
			return;
		}

		const pendingFileStream = getFileStream( file );

		const buf: unknown[] = [];
		pendingFileStream
			.on( "data", function ( d: unknown ) {
				return buf.push( d );
			} )
			.on( "end", function () {
				const pendingFile = Buffer.concat( buf as Uint8Array[] );

				switch ( servemedia.type ) {
					case "vim-cn":
					case "vimcn":
						requestOptions.url = "https://img.vim-cn.com/";
						requestOptions.formData = {
							name: {
								value: pendingFile,
								options: {
									filename: name
								}
							}
						};
						break;

					case "imgur":
						if ( servemedia.imgur.apiUrl.endsWith( "/" ) ) {
							requestOptions.url = servemedia.imgur.apiUrl + "upload";
						} else {
							requestOptions.url = servemedia.imgur.apiUrl + "/upload";
						}
						requestOptions.headers = Object.assign( requestOptions.headers ?? {}, {
							Authorization: `Client-ID ${ servemedia.imgur.clientId }`
						} );
						requestOptions.json = true;
						requestOptions.formData = {
							type: "file",
							image: {
								value: pendingFile,
								options: {
									filename: name
								}
							}
						};
						break;

					case "uguu":
						requestOptions.url = servemedia.uguuApiUrl; // 原配置文件以大写字母开头
						requestOptions.formData = {
							file: {
								value: pendingFile,
								options: {
									filename: name
								}
							},
							randomname: "true"
						};
						break;

					default:
						reject( new Error( "Unknown host type" ) );
				}

				requestOptions.timeout = 30000;

				request.post(
					requestOptions as request.CoreOptions & request.UrlOptions,
					function ( error, response, body ) {
						if ( !error && response.statusCode === 200 ) {
							switch ( servemedia.type ) {
								case "vim-cn":
								case "vimcn":
									resolve( String( body ).trim().replace( "http://", "https://" ) );
									break;
								case "uguu":
									resolve( String( body ).trim() );
									break;
								case "imgur":
									// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
									if ( body && !body.success ) {
										// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
										reject( new Error( `Imgur return: ${ body?.data?.error as string | undefined ?? JSON.stringify( body ) }` ) );
									} else {
										// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
										resolve( body?.data?.link as string );
									}
									break;
							}
						} else {
							reject( new Error( String( error ) ) );
						}
					} );
			} );
	} );
}

/*
 * 上傳到自行架設的 linx 圖床上面
 */
function uploadToLinx( file: File ) {
	return new Promise<string>( function ( resolve, reject ) {
		const name = generateFileName( file.url ?? file.path, file.id );

		pipeFileStream( file, request.put( {
			url: String( servemedia.linxApiUrl ) + name,
			headers: {
				"User-Agent": servemedia.userAgent ?? USERAGENT,
				"Linx-Randomize": "yes",
				Accept: "application/json"
			}
		}, function ( error, response, body ) {
			if ( !error && response.statusCode === 200 ) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				resolve( JSON.parse( body as string ).direct_url as string );
			} else {
				reject( new Error( String( error ) ) );
			}
		} ) ).catch( function ( err ) {
			reject( err );
		} );
	} );
}

/*
 * 決定檔案去向
 */
async function uploadFile( file: File ): Promise<UploadFile | null> {
	let url: string | undefined;
	const fileType = convertFileType( file.type );

	switch ( servemedia.type ) {
		case "vimcn":
		case "vim-cn":
		case "uguu":
			url = await uploadToHost( file );
			break;

		case "sm.ms":
		case "imgur":
			// 公共图床只接受图片，不要上传其他类型文件
			if ( fileType === "photo" ) {
				url = await uploadToHost( file );
			}
			break;

		case "self":
			url = await uploadToCache( file );
			break;

		case "linx":
			url = await uploadToLinx( file );
			break;

		default:

	}

	if ( typeof url !== "undefined" ) {
		return {
			type: fileType,
			url: url
		};
	} else {
		return null;
	}
}

export function init( bridge: TransportBridge, _cnf: TransportConfig ) {
	cnf = _cnf;
	servemedia = cnf.options.servemedia ?? {
		type: "none"
	};

	bridge.addHook( "bridge.send", async function ( msg ) {
		// 上传文件
		// p4: don't bother with files from somewhere without bridges in config
		if (
			( msg.extra.clients || 0 ) > 1 &&
			msg.extra.files &&
			servemedia.type && servemedia.type !== "none"
		) {
			if ( msg.extra.uploads?.length ) {
				return;
			}
			const promises: Promise<UploadFile | null>[] = [];
			const fileCount = msg.extra.files.length;

			// 将聊天消息附带文件上传到服务器
			for ( const [ index, file ] of msg.extra.files.entries() ) {
				if ( file.prepareFile ) {
					try {
						await file.prepareFile();
						winston.debug( `[transport/file] <FileUploader> #${ msg.msgId } File ${ index + 1 }/${ fileCount }: prepare file done.` );
					} catch ( e ) {
						winston.error( "[transport/file] Error on preparing files: ", e );
						continue;
					}
				}

				// eslint-disable-next-line max-len
				if ( servemedia.sizeLimit && servemedia.sizeLimit > 0 && file.size && file.size > servemedia.sizeLimit * 1024 ) {
					winston.debug( `[transport/file] <FileUploader> #${ msg.msgId } File ${ index + 1 }/${ fileCount }: Size limit exceeded. Ignore.` );
				} else {
					promises.push( uploadFile( file ) );
				}
			}

			// 整理上传到服务器之后到URL
			const uploads = ( await Promise.all( promises ).catch( function ( e ) {
				winston.error( "[transport/file] Error on processing files: ", e );
				return [] as UploadFile[];
			} ) ).filter( function ( x ) {
				return x;
			} );
			for ( const [ index, upload ] of uploads.entries() ) {
				winston.debug( `[transport/file] <FileUploader> #${ msg.msgId } File ${ index + 1 }/${ uploads.length } (${ upload?.type ?? "undefined" }): ${ upload?.url ?? "undefined" }` );
			}

			msg.extra.uploads = uploads.filter( function ( file ) {
				return file;
			} ) as UploadFile[];
		} else {
			msg.extra.uploads = [];
		}
	} );
}
