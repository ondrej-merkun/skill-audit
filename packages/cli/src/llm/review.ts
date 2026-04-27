import type { LlmReviewFinding, LlmReviewResult, Severity } from '../types.js';
import type { LocalLlmConfig } from './config.js';
import { LLM_REVIEW_PROMPT_VERSION, buildLlmReviewMessages } from './prompt.js';
import type { LlmReviewPayload } from './prompt.js';

export type LlmReviewFetch = (
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

const SEVERITIES = new Set<Severity>(['critical', 'high', 'medium', 'low', 'info']);

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function parseMessageContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === 'string' ? first.message.content : null;
}

function parseReviewFinding(value: unknown): LlmReviewFinding | null {
  if (!isRecord(value)) return null;
  if (typeof value.severity !== 'string' || !SEVERITIES.has(value.severity as Severity)) {
    return null;
  }
  if (typeof value.category !== 'string' || value.category.trim() === '') return null;
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
    return null;
  }
  if (typeof value.rationale !== 'string' || value.rationale.trim() === '') return null;
  if (value.file !== undefined && typeof value.file !== 'string') return null;
  if (value.suggested_fix !== undefined && typeof value.suggested_fix !== 'string') return null;

  return {
    severity: value.severity as Severity,
    category: value.category,
    confidence: value.confidence,
    rationale: value.rationale,
    ...(value.file !== undefined ? { file: value.file } : {}),
    ...(value.suggested_fix !== undefined ? { suggestedFix: value.suggested_fix } : {}),
  };
}

export function parseLlmReviewResponse(content: string): LlmReviewFinding[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.findings)) return null;
  const findings: LlmReviewFinding[] = [];
  for (const entry of parsed.findings) {
    const finding = parseReviewFinding(entry);
    if (finding === null) return null;
    findings.push(finding);
  }
  return findings;
}

export async function reviewWithOpenAiCompatibleModel(
  config: LocalLlmConfig,
  payload: LlmReviewPayload,
  fetchImpl: LlmReviewFetch = fetch
): Promise<LlmReviewResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

  try {
    const response = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: buildLlmReviewMessages(payload),
        max_tokens: 700,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        modelName: config.name,
        provider: config.provider,
        model: config.model,
        status: 'unavailable',
        promptVersion: LLM_REVIEW_PROMPT_VERSION,
        findings: [],
        error: `HTTP ${response.status}`,
      };
    }

    const message = parseMessageContent(await response.json());
    if (message === null) {
      return {
        modelName: config.name,
        provider: config.provider,
        model: config.model,
        status: 'invalid-response',
        promptVersion: LLM_REVIEW_PROMPT_VERSION,
        findings: [],
      };
    }

    const findings = parseLlmReviewResponse(message);
    if (findings === null) {
      return {
        modelName: config.name,
        provider: config.provider,
        model: config.model,
        status: 'invalid-response',
        promptVersion: LLM_REVIEW_PROMPT_VERSION,
        findings: [],
      };
    }

    return {
      modelName: config.name,
      provider: config.provider,
      model: config.model,
      status: 'ok',
      promptVersion: LLM_REVIEW_PROMPT_VERSION,
      findings,
    };
  } catch (err) {
    return {
      modelName: config.name,
      provider: config.provider,
      model: config.model,
      status: isAbortError(err) ? 'timeout' : 'unavailable',
      promptVersion: LLM_REVIEW_PROMPT_VERSION,
      findings: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
