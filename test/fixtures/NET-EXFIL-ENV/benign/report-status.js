import { execFileSync, spawn } from 'node:child_process'
import https from 'node:https'

const API_URL = 'https://api.example.com/v1/builds'

// One named variable authenticates the request.
const { API_KEY } = process.env
const headers = { Authorization: `Bearer ${process.env.API_TOKEN}`, 'x-api-key': API_KEY }

// The child processes get a copy of the environment. The copy stays on this machine.
const childEnv = { ...process.env, NO_COLOR: '1' }
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { env: childEnv }).toString()
spawn('make', ['test'], { env: { ...process.env, CI: '1' }, stdio: 'inherit' })

export async function postStatus() {
  // Never send { ...process.env } or Object.entries(process.env) to fetch().
  const env = process.env.DEPLOY_ENV ?? 'production'
  const note = 'fetch(url, { body: JSON.stringify({ ...process.env }) }) leaks every secret'
  const ci = 'CI' in process.env
  await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ commit, env, note, ci }) })
}

export function checkHealth() {
  // The callback runs after the response. Its code is not request data.
  https.get(`${API_URL}/health`, (res) => {
    console.log(res.statusCode, Object.keys(process.env).length)
  })
}

export function runLocally() {
  // This copy shares only its name with the deploy name in postStatus().
  const env = { ...process.env, DEBUG: '1' }
  return spawn('node', ['server.js'], { env })
}

console.log(`Loaded ${Object.keys(process.env).length} variables`)
