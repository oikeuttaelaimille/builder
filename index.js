#!/usr/bin/env node

/**
 * @file Bootstrap application
 */

const app = require('./src/app')
const http = require('http')

const DEFAULT_PORT = 3000

const exec = process.argv.slice(0, 2)
const args = process.argv.splice(process.execArgv.length + 2)

const listenTo = args[0] === '-' ? process.stdin : args[0] || DEFAULT_PORT

http.createServer(app).listen(listenTo, () => console.log(`Listening to ${args[0] || DEFAULT_PORT}`))
