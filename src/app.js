const path = require('path')
const os = require('os')
const fs = require('fs')
const express = require('express')
const jobManager = require('./job')
const app = express()

/**
 * TODO
 *  - Make job id unique
 *  - Make streaming endpoint not require build parameters
 *  -
 */

// Default settings (overwritable with environment variables).
const {
	/** Build command. */
	COMMAND,
	/** Build command working directory. */
	COMMAND_WORKING_DIRECTORY = process.cwd(),
	/** Build command max execution time. Default = off. */
	COMMAND_TIMEOUT,
	COMMAND_MAX_BUFFER = 1024 * 1024
} = process.env

// Ensure command is defined.
if (!COMMAND) {
	console.error('Build command is not set')
	process.exit(1)
}

/**
 * Build working directory path.
 *
 * Build working directory path by replacing occurances of {stage} or
 * {language} in COMMAND_WORKING_DIRECTORY by their parameters values.
 * These replace patterns are optional.
 *
 * @param {Job} job
 *
 * @returns {string}
 */
const workingDirectory = (job, template) =>
	Object.entries(job).reduce((workingDirectory, [key, value]) => workingDirectory.replace(`{${key}}`, value), template)

app.post('/start/:name', (req, res, next) => {
	if (!jobManager.isValidJobName(req.params.name)) {
		return res.status(400).json()
	}

	// Exit if job is already running.
	if (jobManager.isJobRunning(req.params.name)) {
		const job = jobManager.getJob(req.params.name)

		console.info(`job ${job.getName()}: process already running`)

		return res.status(409).json(job.getName())
	}

	// Acquire lock for a job.
	const job = jobManager.createJob(req.params.name)

	try {
		// Create temporary file for buffering logs.
		const logstream = job.createWriteStream()

		// Execute build command.
		const command = job.spawn(COMMAND, {
			timeout: COMMAND_TIMEOUT,
			cwd: workingDirectory(req.params, COMMAND_WORKING_DIRECTORY)
		})

		console.info(`job ${job.getName()}: process launched with pid ${command.pid}`)

		command.stderr.pipe(process.stderr)
		// Piping from two sources requires that auto-closing is disabled.
		command.stderr.pipe(logstream, { end: false })
		command.stdout.pipe(logstream, { end: false })

		// The 'close' event is emitted when the stdio streams of a child process
		// have been closed.
		command.on('close', code => {
			console.info(`job ${job.getName()}: process ${command.pid} exited with code ${code}`)

			logstream.close()

			jobManager.removeJob(job)
		})

		command.on('error', err => {
			console.error(`job ${job.getName()}:`, err)
		})

		return res.status(202).json(job.getName())
	} catch (err) {
		if (job) {
			console.error(`job ${job.getName()}:`, err)

			// Release lock if exception is thrown.
			jobManager.removeJob(job)
		} else {
			console.error(err)
		}

		return res.status(500).json()
	}
})

app.get('/logs/:name', async (req, res, next) => {
	if (!jobManager.isValidJobName(req.params.name)) {
		return res.status(400).send()
	}

	res.set('Content-Type', 'text/plain')

	try {
		const err = await jobManager.pollLogs(req.params.name, async buffer => {
			console.debug(`polling job ${req.params.name}: read ${buffer.length} bytes`)

			// Stream bytes read to client.
			return await new Promise((resolve, reject) => {
				return res.write(buffer, err => (err ? reject(err) : resolve()))
			})
		})

		if (err) {
			console.log(`polling job ${req.params.name}: read error`, err)
		}

		return res.end()
	} catch (err) {
		console.log(`polling job ${req.params.name}: error`, err)

		return res.status(404).send()
	}
})

// 404 error handler.
app.use((req, res, next) => {
	res.status(404).send()
})

/**
 * Final error handler.
 */
app.use((error, req, res, next) => {
	console.error(error)

	res.status(500).send()
})

module.exports = app
