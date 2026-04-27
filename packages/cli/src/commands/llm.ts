import chalk from 'chalk';
import Table from 'cli-table3';
import {
  type AddLocalLlmInput,
  type LocalLlmConfig,
  addLlmConfig,
  loadLlmRegistry,
} from '../llm/config.js';
import {
  type FetchLike,
  type LlmHealthResult,
  checkOpenAiCompatibleConnection,
} from '../llm/openai-compatible.js';

const NO_BORDERS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: ' ',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: ' ',
};

export type LlmAddOptions = {
  provider: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  timeout: string | undefined;
  contextTokens: string | undefined;
  disabled: boolean;
};

export type LlmListOptions = {
  json: boolean;
};

export type LlmCheckOptions = {
  json: boolean;
  fetchImpl?: FetchLike;
};

function parseOptionalPositiveInteger(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

function serializeConfig(config: LocalLlmConfig): Record<string, unknown> {
  return {
    name: config.name,
    provider: config.provider,
    base_url: config.baseUrl,
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeout_ms: config.timeoutMs } : {}),
    ...(config.contextTokens !== undefined ? { context_tokens: config.contextTokens } : {}),
    disabled: config.disabled === true,
  };
}

function serializeHealth(name: string, result: LlmHealthResult): Record<string, unknown> {
  return {
    name,
    provider: result.provider,
    model: result.model,
    status: result.status,
    latency_ms: result.latencyMs,
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}

export async function runLlmAdd(name: string, opts: Partial<LlmAddOptions> = {}): Promise<void> {
  if (opts.baseUrl === undefined) throw new Error('--base-url is required');
  if (opts.model === undefined) throw new Error('--model is required');

  const timeoutMs =
    opts.timeout !== undefined
      ? parseOptionalPositiveInteger(opts.timeout, '--timeout')
      : undefined;
  const contextTokens =
    opts.contextTokens !== undefined
      ? parseOptionalPositiveInteger(opts.contextTokens, '--context-tokens')
      : undefined;

  const input: AddLocalLlmInput = {
    name,
    baseUrl: opts.baseUrl,
    model: opts.model,
    ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(opts.disabled === true ? { disabled: true } : {}),
  };
  const config = await addLlmConfig(input);
  process.stdout.write(
    chalk.green(
      `Configured local LLM "${config.name}" (${config.provider}, model ${config.model}).\n`
    )
  );
}

export async function runLlmList(opts: Partial<LlmListOptions> = {}): Promise<void> {
  const options: LlmListOptions = { json: false, ...opts };
  const registry = await loadLlmRegistry();

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        registry.models.map((config) => serializeConfig(config)),
        null,
        2
      )}\n`
    );
    return;
  }

  if (registry.models.length === 0) {
    process.stdout.write(chalk.grey('No local LLMs configured.\n'));
    return;
  }

  const table = new Table({
    chars: NO_BORDERS,
    head: [
      chalk.bold('NAME'),
      chalk.bold('PROVIDER'),
      chalk.bold('MODEL'),
      chalk.bold('BASE URL'),
      chalk.bold('STATUS'),
    ],
    style: { head: [], border: [] },
  });

  for (const config of registry.models) {
    table.push([
      config.name,
      config.provider,
      config.model,
      config.baseUrl,
      config.disabled === true ? chalk.yellow('disabled') : 'enabled',
    ]);
  }

  process.stdout.write(`${table.toString()}\n`);
  process.stdout.write(chalk.grey(`${registry.models.length} local LLM(s) configured.\n`));
}

export async function runLlmCheck(
  name: string,
  opts: Partial<LlmCheckOptions> = {}
): Promise<void> {
  const options: LlmCheckOptions = { json: false, ...opts };
  const registry = await loadLlmRegistry();
  const config = registry.models.find((candidate) => candidate.name === name);
  if (config === undefined) throw new Error(`local LLM "${name}" is not configured`);

  const result = await checkOpenAiCompatibleConnection(config, options.fetchImpl);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(serializeHealth(config.name, result), null, 2)}\n`);
    return;
  }

  const status = result.status === 'ok' ? chalk.green(result.status) : chalk.yellow(result.status);
  process.stdout.write(
    `${config.name} ${status} (${result.provider}, model ${result.model}, ${result.latencyMs}ms)\n`
  );
  if (result.error !== undefined) {
    process.stderr.write(`[skill-audit] llm check: ${result.error}\n`);
  }
}
