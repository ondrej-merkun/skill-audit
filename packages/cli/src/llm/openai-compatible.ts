import type { LocalLlmConfig } from './config.js';

export type LlmHealthStatus = 'ok' | 'unavailable' | 'timeout' | 'invalid-response';

export type LlmHealthResult = {
  provider: string;
  model: string;
  status: LlmHealthStatus;
  latencyMs: number;
  error?: string;
};

export type FetchLike = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// OpenAI-compatible health checks intentionally use only the stable local-server
// subset: POST <baseUrl>/v1/chat/completions with model, messages, max_tokens,
// temperature, and stream=false; a 2xx JSON response with a choices array is
// considered reachable. No skill content, headers, or secrets are sent here.
function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function validChatCompletionsResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('choices' in value)) return false;
  const choices = (value as { choices: unknown }).choices;
  return Array.isArray(choices);
}

// 30s - intentionally long as cold-starting a local LLM can genuinely take a while
const DEFAULT_LLM_LOAD_TIMEOUT_MS = 30_000;

export async function checkOpenAiCompatibleConnection(
  config: LocalLlmConfig,
  fetchImpl: FetchLike = fetch
): Promise<LlmHealthResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_LLM_LOAD_TIMEOUT_MS
  );

  try {
    const response = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        provider: config.provider,
        model: config.model,
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        error: `HTTP ${response.status}`,
      };
    }

    const body = await response.json();
    if (!validChatCompletionsResponse(body)) {
      return {
        provider: config.provider,
        model: config.model,
        status: 'invalid-response',
        latencyMs: Date.now() - startedAt,
      };
    }

    return {
      provider: config.provider,
      model: config.model,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      provider: config.provider,
      model: config.model,
      status: isAbortError(err) ? 'timeout' : 'unavailable',
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}
