/* eslint-disable @typescript-eslint/no-var-requires */
const path = require( "path" );

function getFullPath( ...paths ) {
	return path.join( __dirname, ...paths );
}

/**
 * @param {import('grunt')} grunt
 */
module.exports = function ( grunt ) {
	grunt.initConfig( {
		clean: {
			build: [
				"src/*.js",
				"src/**/*.js",
				"config/*.js"
			]
		}
	} );

	grunt.task.registerTask( "built", function () {
		const done = this.async();

		const built = grunt.file.isFile( __dirname + "/src/main.js" ) && grunt.file.isFile( __dirname + "/config/config.js" );

		if ( !built ) {
			grunt.task.run( [ "default" ] );
		}

		done( true );
	} );

	grunt.task.registerTask( "reloadFlag", async function () {
		if ( grunt.file.exists( getFullPath( "reloadFlag.txt" ) ) ) {
			try {
				grunt.file.write( getFullPath( "reloadFlag.txt" ), "Reload after build success.\n\nDate: " + new Date().toISOString() );
				grunt.log.write( `Refresh "${ getFullPath( "reloadFlag.txt" ) }" success.\n` );
			} catch ( e ) {
				grunt.log.warn( `Fail to refresh "${ getFullPath( "reloadFlag.txt" ) }": ${ e }\n` );
			}
		}

		this.async()( true );
	} );

	require( "./scripts/grunt-typescript" )( grunt );
	grunt.loadNpmTasks( "grunt-contrib-clean" );

	grunt.registerTask( "build", [ "tsc" ] );
	grunt.registerTask( "default", [ "build", "reloadFlag" ] );
	grunt.registerTask( "build:noReloadFlag", [ "build" ] );
};
