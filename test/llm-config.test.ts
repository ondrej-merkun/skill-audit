import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addLlmConfig,
  getLlmConfigPath,
  loadLlmRegistry,
  normalizeLoopbackBaseUrl,
} from '../packages/cli/src/llm/config.js';

let tempConfigDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  tempConfigDir = join(
    tmpdir(),
    `skill-audit-llm-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tempConfigDir, { recursive: true });
  process.env.XDG_CONFIG_HOME = tempConfigDir;
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  await rm(tempConfigDir, { recursive: true, force: true });
});

describe('local LLM config', () => {
  it('stores valid OpenAI-compatible loopback model configs under XDG_CONFIG_HOME', async () => {
    await addLlmConfig({
      name: 'lmstudio',
      baseUrl: 'http://127.0.0.1:1234/',
      model: 'local-model',
      timeoutMs: 1500,
      contextTokens: 4096,
    });

    const registry = await loadLlmRegistry();
    expect(registry.models).toEqual([
      {
        name: 'lmstudio',
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:1234',
        model: 'local-model',
        timeoutMs: 1500,
        contextTokens: 4096,
      },
    ]);
    expect(await readFile(getLlmConfigPath(), 'utf-8')).toContain('"models"');
  });

  it('accepts localhost and IPv6 loopback URLs', () => {
    expect(normalizeLoopbackBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
    expect(normalizeLoopbackBaseUrl('http://[::1]:11434/')).toBe('http://[::1]:11434');
  });

  it('rejects non-loopback base URLs by default', async () => {
    await expect(
      addLlmConfig({
        name: 'remote',
        baseUrl: 'https://api.example.com',
        model: 'remote-model',
      })
    ).rejects.toThrow('loopback');
  });

  it('rejects duplicate model names', async () => {
    await addLlmConfig({
      name: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
    });

    await expect(
      addLlmConfig({
        name: 'ollama',
        baseUrl: 'http://localhost:11435',
        model: 'mistral',
      })
    ).rejects.toThrow('already exists');
  });

  it('reports malformed JSON without falling back to an empty registry', async () => {
    const path = getLlmConfigPath();
    await mkdir(join(tempConfigDir, 'skill-audit'), { recursive: true });
    await writeFile(path, '{not-json', 'utf-8');

    await expect(loadLlmRegistry()).rejects.toThrow('Could not parse local LLM config');
  });

  it('rejects credential-bearing URLs without echoing the secret', async () => {
    await expect(
      addLlmConfig({
        name: 'secret-url',
        baseUrl: 'http://user:super-secret@127.0.0.1:11434',
        model: 'llama3',
      })
    ).rejects.toThrow('must not contain credentials');
    await expect(
      addLlmConfig({
        name: 'secret-url',
        baseUrl: 'http://user:super-secret@127.0.0.1:11434',
        model: 'llama3',
      })
    ).rejects.not.toThrow('super-secret');
  });
});
