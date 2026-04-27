import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type LocalLlmProvider = 'openai-compatible';

export type LocalLlmConfig = {
  name: string;
  provider: LocalLlmProvider;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  contextTokens?: number;
  disabled?: boolean;
};

export type LocalLlmRegistry = {
  version: 1;
  models: LocalLlmConfig[];
};

export type AddLocalLlmInput = {
  name: string;
  provider?: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  contextTokens?: number;
  disabled?: boolean;
};

function getConfigDir(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

export function getLlmConfigPath(): string {
  return join(getConfigDir(), 'skill-audit', 'llms.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function parseConfig(value: unknown): LocalLlmConfig {
  if (!isRecord(value)) throw new Error('model entries must be objects');
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    throw new Error('model name must be a non-empty string');
  }
  if (value.provider !== 'openai-compatible') {
    throw new Error('provider must be openai-compatible');
  }
  if (typeof value.baseUrl !== 'string' || value.baseUrl.trim() === '') {
    throw new Error('baseUrl must be a non-empty string');
  }
  if (typeof value.model !== 'string' || value.model.trim() === '') {
    throw new Error('model must be a non-empty string');
  }

  const timeoutMs = parsePositiveInteger(value.timeoutMs, 'timeoutMs');
  const contextTokens = parsePositiveInteger(value.contextTokens, 'contextTokens');
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
    throw new Error('disabled must be a boolean');
  }

  return {
    name: value.name,
    provider: value.provider,
    baseUrl: value.baseUrl,
    model: value.model,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(value.disabled !== undefined ? { disabled: value.disabled } : {}),
  };
}

function parseRegistry(value: unknown): LocalLlmRegistry {
  if (!isRecord(value)) throw new Error('registry must be an object');
  if (value.version !== 1) throw new Error('registry version must be 1');
  if (!Array.isArray(value.models)) throw new Error('models must be an array');
  return {
    version: 1,
    models: value.models.map(parseConfig),
  };
}

export async function loadLlmRegistry(): Promise<LocalLlmRegistry> {
  try {
    return parseRegistry(JSON.parse(await readFile(getLlmConfigPath(), 'utf-8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, models: [] };
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse local LLM config: ${msg}`);
  }
}

export async function saveLlmRegistry(registry: LocalLlmRegistry): Promise<void> {
  const path = getLlmConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.');
}

export function normalizeLoopbackBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('base URL must be a valid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('base URL must use http or https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('base URL must not contain credentials');
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error('base URL must be loopback unless remote access is explicitly supported');
  }

  return parsed.toString().replace(/\/+$/, '');
}

export function validateNewLlmConfig(
  input: AddLocalLlmInput,
  existingModels: LocalLlmConfig[]
): LocalLlmConfig {
  const name = input.name.trim();
  if (name === '') throw new Error('model name is required');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('model name may contain only letters, numbers, dots, underscores, and hyphens');
  }
  if (existingModels.some((model) => model.name === name)) {
    throw new Error(`local LLM "${name}" already exists`);
  }

  const provider = input.provider ?? 'openai-compatible';
  if (provider !== 'openai-compatible') {
    throw new Error('only openai-compatible local LLM providers are supported');
  }

  const model = input.model.trim();
  if (model === '') throw new Error('model id is required');

  const timeoutMs = parsePositiveInteger(input.timeoutMs, 'timeoutMs');
  const contextTokens = parsePositiveInteger(input.contextTokens, 'contextTokens');

  return {
    name,
    provider,
    baseUrl: normalizeLoopbackBaseUrl(input.baseUrl),
    model,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
  };
}

export async function addLlmConfig(input: AddLocalLlmInput): Promise<LocalLlmConfig> {
  const registry = await loadLlmRegistry();
  const config = validateNewLlmConfig(input, registry.models);
  await saveLlmRegistry({ version: 1, models: [...registry.models, config] });
  return config;
}
