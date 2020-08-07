/**
 * Custom JobError
 */
class JobError extends Error {
	/**
	 * Create JobError
	 * @param {String} message
	 */
	constructor(message) {
		super(message)
		this.name = this.constructor.name
		Error.captureStackTrace(this, this.constructor)
	}

	/**
	 * Check if JobError is caused by one of given error types.
	 *
	 * @param {string | string[]} errors
	 */
	isOfType(errors) {
		if (typeof errors === 'string') {
			return this.message === errors
		}

		return errors.includes(this.message)
	}
}

JobError.ERROR_INVALID_NAME = 'Job name is invalid'
JobError.ERROR_INVALID_ARGS = 'Job arguments are invalid'
JobError.ERROR_ALREADY_RUNNING = 'Job is already running'
JobError.ERROR_JOB_NOT_FOUND = 'Job does not exists'
JobError.ERROR_MAX_JOBS = 'Maximum number of jobs are already running'

module.exports = {
	JobError
}
