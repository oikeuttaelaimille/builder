#!/usr/bin/env node

/**
 * @file Bootstrap application
 */

const app = require('./src/app')
const http = require('http')

const DEFAULT_PORT = 3000
const DEFAULT_HOST = 'localhost'

// const exec = process.argv.slice(0, 2)
const args = process.argv.slice(process.execArgv.length + 2)

const port = args[0] || DEFAULT_PORT
const host = args[1] || DEFAULT_HOST

http.createServer(app).listen(port, host, () => console.log(`Listening to ${host}:${port}`))
