'use strict'

const childProcess = require('child_process')
const crypto = require('crypto')
const EventEmitter = require('events')

const { JobError } = require('./errors')
const {
	COMMAND,
	COMMAND_TIMEOUT,
	COMMAND_WORKING_DIRECTORY,
	COMMAND_MAX_BUFFER,
	COMMAND_MAX_JOBS,
	COMMAND_CLEANUP_TIMEOUT
} = require('./config')

class Job extends EventEmitter {
	static State = Object.freeze({
		RUNNING: 'RUNNING',
		EXITED: 'EXITED'
	})

	/**
	 * @param {string} name
	 * @param {string[]} args
	 */
	constructor(name, args) {
		super()

		// Name must pass `isValidName`.
		if (!this.constructor.isValidName(name)) {
			throw new JobError(JobError.ERROR_INVALID_NAME)
		}

		// Arguments must pass `isValidArguments`
		if (!this.constructor.isValidArguments(args)) {
			throw new JobError(JobError.ERROR_INVALID_ARGS)
		}

		/**
		 * ID should be used when querying logs to ensure that clients will
		 * see logs for only for their instance.
		 */
		this.id = crypto.randomBytes(16).toString('hex')
		this.name = name
		this.args = args

		// Command log buffer.
		this.logBuffer = Buffer.alloc(COMMAND_MAX_BUFFER)
		this.logBufferLen = 0

		// Spawn job process.
		this.process = childProcess.spawn(COMMAND, this.args, {
			timeout: COMMAND_TIMEOUT,
			cwd: COMMAND_WORKING_DIRECTORY
		})

		this.process.stdout.on('data', data => {
			// DON'T forward subprocess stdout to own stdout.
			// process.stdout.write(data)

			// NodeJS guarantees that if buffer did not contain enough space
			// to fit the entire string, only part of string will be written.
			// However, partially encoded characters will not be written.
			this.logBufferLen += this.logBuffer.write(data.toString(), this.logBufferLen)

			// If output is truncated, consider increasing COMMAND_MAX_BUFFER.

			// Notify listeners that new data is available in the buffer.
			this.emit('data', data.length)
		})

		this.process.stderr.on('data', data => {
			// Forward subprocess stderr to own stderr.
			process.stderr.write(data)

			// NodeJS guarantees that if buffer did not contain enough space
			// to fit the entire string, only part of string will be written.
			this.logBufferLen += this.logBuffer.write(data.toString(), this.logBufferLen)

			// Notify listeners that new data is available in the buffer.
			this.emit('data', data.length)
		})

		this.process.on('error', err => {
			console.error(`job ${job.name}:`, err)
			this.emit('error', err)
		})

		// The 'close' event is emitted when the stdio streams of a child process
		// have been closed.
		this.process.on('close', code => {
			console.info(`job ${this.name}: process ${this.process.pid} exited with code ${code}`)
			this.emit('close', code)
		})

		/** When the job was started. */
		this.started = Date.now()

		console.info(`job ${this.name}: process launched with pid ${this.process.pid}`)
	}

	/**
	 * Validate job name.
	 *
	 * 1. Starts with `word character`.
	 * 2. Contains only `word characters and hyphens`.
	 * 3. Can contain multiple `words` that follow conditions above separated with a `+`.
	 *
	 * Example:
	 *  * `live+da-cc`
	 *  * `testing+en`
	 *
	 * @param {string} name
	 */
	static isValidName = name => /^\w[\w-]+(\+\w[\w-]+)*$/.test(name)

	/**
	 * Validate jobs arguments.
	 *
	 * 1. Starts with `word character`.
	 * 2. Contains only `word characters and hyphens`.
	 *
	 * @param {string[]} args array
	 */
	static isValidArguments = args => args.every(argument => /^\w[\w-]+$/.test(argument))

	isRunning() {
		return this.getState() === this.constructor.State.RUNNING
	}

	/**
	 * Get job state.
	 *
	 * This will return `Job.State.EXITED` once child process exits or
	 * `Job.State.RUNNING` if process is still running.
	 *
	 * @returns {typeof Job.State[keyof typeof Job.State]}
	 */
	getState() {
		// The subprocess.exitCode property indicates the exit code of the
		// child process. If the child process is still running, the field will
		// be null.
		return this.process.exitCode == null ? this.constructor.State.RUNNING : this.constructor.State.EXITED
	}
}

class JobManager {
	constructor() {
		/** @type {Map<string, Job>} */
		this.jobs = new Map()
	}

	/**
	 * Get job.
	 *
	 * @param {string} name
	 */
	get(name) {
		return this.jobs.get(name)
	}

	/**
	 * Get job by id.
	 *
	 * @param {string} name
	 */
	getById(id) {
		for (let job of this.jobs.values()) {
			if (job.id === id) {
				return job
			}
		}
	}

	/**
	 * Check if given job is running.
	 *
	 * @param {string} name
	 */
	isRunning(name) {
		return this.jobs.has(name) && this.get(name).getState() === Job.State.RUNNING
	}

	/**
	 * Create new job.
	 *
	 * @param {string} name
	 */
	create(name, extraArgs = []) {
		// Job must not be running.
		if (this.isRunning(name)) {
			throw new JobError(JobError.ERROR_ALREADY_RUNNING)
		}

		// This might cause builder to lock if jobs are started too quickly.
		// An error message instructing to again later should be displayed.
		if (this.jobs.length >= COMMAND_MAX_JOBS) {
			throw new JobError(JobError.ERROR_MAX_JOBS)
		}

		const args = [].concat(extraArgs, name.split('+'))
		const job = new Job(name, args)

		// Add new job to manager state.
		this.replace(name, job)

		// The 'close' event is emitted when the stdio streams of a child process
		// have been closed.
		job.on('close', code => {
			// Defer cleanup until `COMMAND_CLEANUP_TIMEOUT` to give clients
			// more time to read the logs.
			job.timeout = setTimeout(() => {
				this.remove(job)
			}, COMMAND_CLEANUP_TIMEOUT * 1000)
		})

		return job
	}

	replace(name, job) {
		const oldJob = this.jobs.get(name)
		if (oldJob && oldJob.timeout) {
			clearTimeout(oldJob)
		}

		this.jobs.set(name, job)
	}

	/**
	 * Remove job.
	 *
	 * @param {Job} job
	 */
	remove(job) {
		const oldJob = this.jobs.get(job.name)
		if (oldJob && oldJob.timeout) {
			clearTimeout(oldJob)
		}

		// Cleanup global state.
		this.jobs.delete(job.name)
	}
}

module.exports = {
	Job,
	jobManager: new JobManager()
}
