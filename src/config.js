'use strict'

/**
 * @file Manages the configuration for the application. This should be the
 * 	first file imported by the program.
 */

const {
	/** Port to listen to. */
	PORT = 3000,
	/** IP address to listen to. */
	HOST = 'localhost',
	/** Build command. */
	COMMAND,
	/** Build command working directory. */
	COMMAND_WORKING_DIRECTORY = process.cwd(),
	/** Build command max execution time. undefined = off. */
	COMMAND_TIMEOUT,
	/** Command log buffer size. */
	COMMAND_MAX_BUFFER = 16384, // 16 KiB
	/**
	 * Determines how long in seconds the command log output is readable after
	 * the process has exited.
	 */
	COMMAND_CLEANUP_TIMEOUT = 30,
	/** Determines maximum number of simultaneous jobs. */
	COMMAND_MAX_JOBS = 30,
	/** How often new build logs are polled from filesystem in milliseconds. */
	POLL_INTERVAL = 500,
	/** Poll max chunk size. */
	POLL_BUFFER_SIZE = 1024
	/**  */
} = process.env

/**
 * Validate config. This is called on program startup.
 */
function isConfigValid() {
	// Ensure `COMMAND` is defined.
	if (!COMMAND) {
		console.error('Build command is not set')
		process.exit(1)
	}

	// Ensure `NODE_ENV` is defined.
	if (!process.env.NODE_ENV) {
		// Overwrite process.env.NODE_ENV
		// Some libraries may use this as well.
		process.env.NODE_ENV = 'development'
	}

	console.info('Configuration is valid')
}

isConfigValid()

// Default settings (overwrite with environment variables).
module.exports = {
	PORT,
	HOST,
	COMMAND,
	COMMAND_WORKING_DIRECTORY,
	COMMAND_TIMEOUT,
	COMMAND_MAX_BUFFER,
	COMMAND_CLEANUP_TIMEOUT,
	COMMAND_MAX_JOBS,
	POLL_INTERVAL,
	POLL_BUFFER_SIZE
}
