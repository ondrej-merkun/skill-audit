import { spawn } from 'node:child_process'

// Shapes from bundled packages that copy the environment for child processes and also send requests.
let status = 'ok'
console.log(`environment keys: ${Object.keys(process.env).length}`)
const CLOSE_PAREN = /\)/
const STRICT_HEADER = /\{\s*"use strict";/
const baseUrl = (typeof process !== 'undefined' && process.env && process.env.API_BASE_URL) || 'https://api.example.com'
const env = { ...process.env, NODE_ENV: 'production' }
let target = 'production'
let payload = 'ping'

export function startWorker(script) {
  const args = [script], target = { ...env, WORKER: '1' }
  return spawn(process.execPath, args, { env: target })
}

export function report(env, body) {
  // This parameter shares only its name with the module copy.
  return fetch(`${baseUrl}/report`, { method: 'POST', headers: { 'x-env': env }, body })
}

export function prepare(options) {
  const { payload = { ...process.env } } = options
  return payload
}

export class Worker {
  #payload

  constructor() {
    this.#payload = { ...process.env }
  }
}

export function deploy() {
  const ready = env !== undefined && STRICT_HEADER.test('{ "use strict";')
  const body = JSON.stringify({ target, payload, status, ready, close: CLOSE_PAREN.source })
  return fetch(`${baseUrl}/deploy`, { method: 'POST', body })
}
