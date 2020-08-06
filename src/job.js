const os = require('os')
const fs = require('fs')
const util = require('util')
const path = require('path')
const childProcess = require('child_process')

const fsPromises = {
	open: fs.promises.open,
	fstat: util.promisify(fs.fstat),
	read: util.promisify(fs.read),
	close: util.promisify(fs.close)
}

/**
 * Global state: running jobs by name.
 *
 * @type Map<string, Job>
 */
const RUNNING_JOBS = new Map()

// Settings (overwrite with environment variables).
const {
	/** Directory where build logs are buffered. */
	LOG_DIRECTORY = path.join(os.tmpdir(), 'builder'),
	/** How often new build logs are polled from filesystem in milliseconds. */
	POLL_INTERVAL = 500,
	/** Poll max chunk size. */
	POLL_BUFFER_SIZE = 1024
} = process.env

// Ensure log directory exists.
fs.mkdirSync(LOG_DIRECTORY, { mode: 0o755, recursive: true })

/**
 * Validate request.
 *
 * @param {string} job
 */
const isValidArgument = argument => /^\w+$/.test(argument)

/**
 * Validate job name.
 *
 * @param {string} name
 */
const isValidJobName = name => /^\w+(-\w+)*$/

class Job {
	/**
	 * @param {string} name
	 * @param {string[]} args
	 */
	constructor(name, args) {
		// Assert all arguments must pass `isValidArgument`
		if (!args.every(isValidArgument)) {
			throw new Error(`Invalid arguments ${args}`)
		}

		this.name = name
		this.args = args
	}

	getName() {
		return this.name
	}

	getArguments() {
		return this.args
	}

	spawn(command, options) {
		const args = this.getArguments()
		const process = childProcess.spawn(command, args, options)

		this.process = process

		return process
	}

	/**
	 * Create write stream for build output.
	 */
	createWriteStream() {
		const file = fs.createWriteStream(this.logFilePath(), {
			flags: 'w+',
			mode: 0o644
		})

		return file
	}

	/**
	 * Build log file path.
	 *
	 * @param {Job} job
	 */
	logFilePath() {
		return path.join(LOG_DIRECTORY, `${this.getName()}.log`)
	}
}

function getJob(name) {
	return RUNNING_JOBS.get(name)
}

function isJobRunning(name) {
	return RUNNING_JOBS.has(name)
}

/**
 * Create new job.
 *
 * @param {string} name
 */
function createJob(name, extraArgs = []) {
	// Assert name must pass `isValidName`
	if (!isValidJobName(name)) {
		throw new Error(`Invalid name ${name}`)
	}

	if (isJobRunning(name)) {
		throw new Error(`Job '${name}' is already running`)
	}

	const args = [].concat(extraArgs, name.split('-'))
	const newJob = new Job(name, args)

	// Add job to global state.
	RUNNING_JOBS.set(name, newJob)

	return newJob
}

function removeJob(job) {
	if (!isJobRunning(job.getName())) {
		throw new Error(`Job '${job.getName()}' is not running`)
	}

	// Cleanup global state.
	RUNNING_JOBS.delete(job.getName())
}

/**
 * Poll for new log messages.
 *
 * Once polling has successfully started the returned promise will never be
 * rejected. Instead the promise is resolved with errors that have occurred.
 * If polling finished without an error the resolved value is undefined.
 *
 * @param {Buffer} buffer
 * @param {number} pollInterval
 * @param {(buffer: Buffer, totalBytesRead: number) => Promise<void>} callback
 *
 * @returns {Promise<void|Error>}
 */
async function pollLogs(name, callback) {
	// Assert name must pass `isValidName`
	if (!isValidJobName(name)) {
		throw new Error(`Invalid name ${name}`)
	}

	// Don't care if the job is running or not as
	// long as job.logfilePath() exists.
	const job = new Job(name, [])
	const buffer = Buffer.alloc(POLL_BUFFER_SIZE)

	// Throw if log file is missing.
	const file = await fsPromises.open(job.logFilePath(), 'r+')

	// Poll log file until there is more data to read and write it to
	// connection. When all of the file is read check if job still running
	// (= might still generate more logs) or close the connection.
	return new Promise((resolve, reject) => {
		let bytesRead = 0

		const doPollLogs = async () => {
			try {
				const stats = await fsPromises.fstat(file.fd)

				// Read all we can before checking if the job is still running.
				// This sends the whole log even if job was already stopped.
				// Check if we can read more from file.
				while (stats.size > bytesRead) {
					const readResult = await fsPromises.read(file.fd, buffer, 0, buffer.length, bytesRead)

					// Keep track of position we have reached in the file.
					bytesRead += readResult.bytesRead

					const slice = readResult.buffer.slice(0, readResult.bytesRead)

					// Pass chunk of polled data to callback.
					await callback(slice, bytesRead)
				}

				// Exit if job is no longer running.
				if (!isJobRunning(name)) {
					// RACE CONDITION: Program wrote more logs after the last
					// read but is already exited at this point.
					const stats = await fsPromises.fstat(file.fd)

					if (stats.size <= bytesRead) {
						// Resolve nothing to indicate success.
						return resolve()
					}
				}
			} catch (err) {
				// We might have successfully passed some data to callback
				// already. Resolve the promise with the error indicate
				// partial failure.
				return resolve(err)
			}

			// Schedule next polling.
			setTimeout(doPollLogs, POLL_INTERVAL)
		}

		// Schedule doPollLogs(). It will be iterated using setTimeout() until
		// polling is completed.
		return doPollLogs()
	}).finally(() => {
		// Cleanup: close file handle.
		fsPromises.close(file.fd)
	})
}

module.exports = {
	createJob,
	removeJob,
	getJob,
	isJobRunning,
	isValidJobName,
	pollLogs
}
