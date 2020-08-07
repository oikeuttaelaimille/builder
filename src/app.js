'use strict'

const { HOST, PORT } = require('./config')

const http = require('http')
const express = require('express')

const { jobManager } = require('./job')
const { JobError } = require('./errors')

const app = express()

app.post('/start/:name', (req, res) => {
	const jobName = req.params.name

	console.log(`job ${jobName}: starting`)

	try {
		// Create new job with given job name.
		const job = jobManager.create(jobName)

		return res.status(202).json({ name: job.name, id: job.id })
	} catch (err) {
		if (err instanceof JobError) {
			// Return HTTPBadRequest (400) if trying to launch job with invalid parameters.
			if (err.isOfType([JobError.ERROR_INVALID_NAME, JobError.ERROR_INVALID_ARGS])) {
				console.info(`job ${jobName}: invalid parameters`)
				return res.status(400).json()
			}
			// Return HTTPConflict (409) if trying to launch job that is already running.
			else if (err.isOfType(JobError.ERROR_ALREADY_RUNNING)) {
				console.info(`job ${jobName}: process already running`)

				const job = jobManager.get(jobName)
				if (job) {
					return res.status(409).json({
						name: job.name,
						id: job.id
					})
				}
			}
			// Return HTTPTooManyRequests (429) if too many jobs are already running.
			else if (err.isOfType(JobError.ERROR_ALREADY_RUNNING)) {
				console.info(`job ${jobName}: too many running jobs`)

				return res.status(429).json()
			}
		}

		console.error(err)

		// Unknown error.
		return res.status(500).json(err)
	}
})

function streamJobLogs(job, stream) {
	console.log(`Streaming logs ${job.name} ${job.id}`)

	// Keep track of current position in the buffer.
	let pos = job.logBufferLen

	console.log(job.name, job.logBuffer)

	// Send everything we have so far.
	stream.write(job.logBuffer, 0, pos)

	// The job is still running so we send data as it comes in.
	//  * New data is available when `data` event is emitted.
	//  * Connection is closed when `close` event is emitted.
	if (job.isRunning()) {
		job.on('data', len => {
			const buffer = job.logBuffer

			if (pos >= job.logBufferLen) {
				console.warn('nothing to send')
				return
			}

			// console.debug(`sending ${pos} -> ${job.logBufferLen}:`, buffer.slice(pos, job.logBufferLen))

			// Slice returns a new Buffer that references the same memory as the original.
			stream.write(buffer.slice(pos, job.logBufferLen))
			pos = job.logBufferLen
		})

		job.on('close', () => {
			const buffer = job.logBuffer

			if (pos < job.logBufferLen) {
				res.write(buffer.slice(pos, job.logBufferLen))
				pos = job.logBufferLen
			}

			stream.end()

			console.log(`Streaming logs ${job.name} ${job.id} ended`)
		})
	} else {
		// Job is no longer running so we can close the connection.
		return res.end()
	}
}

/**
 * @deprecated
 *
 * It's preferable to use job id to get logs.
 */
app.get('/logs/:name', async (req, res, next) => {
	const job = jobManager.get(req.params.name)

	if (job == null) {
		return res.status(400).send()
	}

	res.set('Content-Type', 'text/plain')
	res.set('Transfer-Encoding', 'chunked')

	streamJobLogs(job, res)
})

app.get('/logs/by-id/:id', async (req, res, next) => {
	const job = jobManager.getById(req.params.id)

	if (job == null) {
		return res.status(400).send()
	}

	res.set('Content-Type', 'text/plain')
	res.set('Transfer-Encoding', 'chunked')

	streamJobLogs(job, res)
})

// 404 error handler.
app.use((req, res, next) => {
	res.status(404).json()
})

/**
 * Final error handler.
 */
app.use((error, req, res, next) => {
	console.error(error)

	res.status(500).json()
})

const server = http.createServer(app)

server.listen(PORT, HOST, () => {
	console.info(`Listening to ${HOST}:${PORT}`)
	console.info(`Environment: ${process.env.NODE_ENV}`)
})
