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
const CATEGORIES = new Set([
  'prompt-injection',
  'network',
  'filesystem',
  'secrets',
  'persistence',
  'dependency',
  'other',
]);
const PLACEHOLDER_STRINGS = new Set([
  'short reason',
  'optional relative path',
  'optional short fix',
  'specific reason tied to the payload',
  'path to file',
  'none',
]);

type ParsedReviewFinding = LlmReviewFinding | 'skip' | null;

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

function normalizeSeverity(value: unknown): Severity | null {
  const severity = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SEVERITIES.has(severity as Severity) ? (severity as Severity) : null;
}

function normalizeCategory(value: unknown): string | null {
  const category = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (category.includes('|')) return null;
  if (CATEGORIES.has(category)) return category;
  if (category.includes('prompt')) return 'prompt-injection';
  if (category.includes('network')) return 'network';
  if (category.includes('file')) return 'filesystem';
  if (category.includes('credential') || category.includes('secret')) return 'secrets';
  if (category.includes('persist')) return 'persistence';
  if (category.includes('depend')) return 'dependency';
  return null;
}

function normalizeConfidence(value: unknown): number | null {
  if (value === undefined) return 0.5;
  const confidence =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN;
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text === '' || PLACEHOLDER_STRINGS.has(text.toLowerCase())) return undefined;
  return text;
}

function isNoFindingRationale(rationale: string): boolean {
  const normalized = rationale.trim().toLowerCase().replace(/\.$/, '');
  if (normalized === '') return true;
  if (PLACEHOLDER_STRINGS.has(normalized)) return true;
  if (normalized.startsWith('no additional ')) return true;
  if (normalized.startsWith('no prompt injection vulnerability found')) return true;
  if (normalized.startsWith('no unsafe ')) return true;
  if (normalized.startsWith('no dependency risk ')) return true;
  if (normalized.includes(' is secure')) return true;
  if (/\bno\b.+\b(found|detected)\b/.test(normalized)) return true;
  return false;
}

function parseReviewFinding(value: unknown): ParsedReviewFinding {
  if (!isRecord(value)) return null;

  const severity = normalizeSeverity(value.severity);
  const category = normalizeCategory(value.category);
  const confidence = normalizeConfidence(value.confidence);
  const rationale = typeof value.rationale === 'string' ? value.rationale.trim() : '';

  if (isNoFindingRationale(rationale)) return 'skip';
  if (severity === null || category === null || confidence === null) return null;
  if (value.file !== undefined && typeof value.file !== 'string') return null;
  if (value.file_path !== undefined && typeof value.file_path !== 'string') return null;
  if (value.suggested_fix !== undefined && typeof value.suggested_fix !== 'string') return null;

  const normalizedFile =
    normalizeOptionalText(value.file) ?? normalizeOptionalText(value.file_path);
  const normalizedSuggestedFix = normalizeOptionalText(value.suggested_fix);

  return {
    severity,
    category,
    confidence,
    rationale,
    ...(normalizedFile !== undefined ? { file: normalizedFile } : {}),
    ...(normalizedSuggestedFix !== undefined ? { suggestedFix: normalizedSuggestedFix } : {}),
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
    if (finding === 'skip') continue;
    findings.push(finding);
  }
  return findings;
}

// 60s - intentionally long as local LLMs can be slow
const DEFAULT_LLM_REVIEW_TIMEOUT_MS = 60_000;

export async function reviewWithOpenAiCompatibleModel(
  config: LocalLlmConfig,
  payload: LlmReviewPayload,
  fetchImpl: LlmReviewFetch = fetch
): Promise<LlmReviewResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_LLM_REVIEW_TIMEOUT_MS
  );

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
