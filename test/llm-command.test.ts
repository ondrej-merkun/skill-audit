import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runLlmAdd,
  runLlmCheck,
  runLlmList,
  type LlmCheckOptions,
} from '../packages/cli/src/commands/llm.js';
import type { FetchLike } from '../packages/cli/src/llm/openai-compatible.js';
import stripAnsi from './helpers/strip-ansi.js';

let tempConfigDir: string;
let originalXdgConfigHome: string | undefined;
let stdoutChunks: string[];
let stderrChunks: string[];

beforeEach(async () => {
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  tempConfigDir = join(
    tmpdir(),
    `skill-audit-llm-command-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tempConfigDir, { recursive: true });
  process.env.XDG_CONFIG_HOME = tempConfigDir;

  stdoutChunks = [];
  stderrChunks = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  await rm(tempConfigDir, { recursive: true, force: true });
});

function okFetch(calls: Array<{ url: string; body: unknown }>): FetchLike {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    };
  };
}

describe('llm commands', () => {
  it('adds and lists local LLM configs in human and JSON formats', async () => {
    await runLlmAdd('ollama', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
      timeout: '2000',
      contextTokens: '4096',
    });
    await runLlmList({});

    const human = stripAnsi(stdoutChunks.join(''));
    expect(human).toContain('Configured local LLM "ollama"');
    expect(human).toContain('ollama');
    expect(human).toContain('openai-compatible');
    expect(human).toContain('llama3');

    stdoutChunks = [];
    await runLlmList({ json: true });
    const parsed = JSON.parse(stdoutChunks.join(''));
    expect(parsed).toEqual([
      {
        name: 'ollama',
        provider: 'openai-compatible',
        base_url: 'http://localhost:11434',
        model: 'llama3',
        timeout_ms: 2000,
        context_tokens: 4096,
        disabled: false,
      },
    ]);
    expect(stderrChunks.join('')).toBe('');
  });

  it('checks a model with the minimal OpenAI-compatible chat request', async () => {
    await runLlmAdd('lmstudio', {
      baseUrl: 'http://127.0.0.1:1234/api',
      model: 'local-model',
    });
    stdoutChunks = [];
    const calls: Array<{ url: string; body: unknown }> = [];

    await runLlmCheck('lmstudio', { fetchImpl: okFetch(calls) });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('lmstudio ok');
    expect(calls[0]?.url).toBe('http://127.0.0.1:1234/api/v1/chat/completions');
    expect(calls[0]?.body).toMatchObject({
      model: 'local-model',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 1,
      stream: false,
    });
  });

  it('emits JSON health results without stderr diagnostics on success', async () => {
    await runLlmAdd('json-model', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
    });
    stdoutChunks = [];

    await runLlmCheck('json-model', { json: true, fetchImpl: okFetch([]) });

    const parsed = JSON.parse(stdoutChunks.join(''));
    expect(parsed).toMatchObject({
      name: 'json-model',
      provider: 'openai-compatible',
      model: 'llama3',
      status: 'ok',
    });
    expect(typeof parsed.latency_ms).toBe('number');
    expect(stderrChunks.join('')).toBe('');
  });

  it('reports connection failures as unavailable', async () => {
    await runLlmAdd('missing-server', {
      baseUrl: 'http://localhost:6553',
      model: 'llama3',
    });
    stdoutChunks = [];
    const failingFetch: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };

    await runLlmCheck('missing-server', { json: true, fetchImpl: failingFetch });

    expect(JSON.parse(stdoutChunks.join('')).status).toBe('unavailable');
  });

  it('reports timeouts', async () => {
    await runLlmAdd('slow-model', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
      timeout: '1',
    });
    stdoutChunks = [];
    const timeoutFetch: LlmCheckOptions['fetchImpl'] = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });

    await runLlmCheck('slow-model', { json: true, fetchImpl: timeoutFetch });

    expect(JSON.parse(stdoutChunks.join('')).status).toBe('timeout');
  });

  it('reports malformed provider responses', async () => {
    await runLlmAdd('bad-model', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
    });
    stdoutChunks = [];
    const malformedFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ object: 'chat.completion' }),
    });

    await runLlmCheck('bad-model', { json: true, fetchImpl: malformedFetch });

    expect(JSON.parse(stdoutChunks.join('')).status).toBe('invalid-response');
  });
});
