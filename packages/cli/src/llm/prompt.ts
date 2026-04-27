import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import type { Finding, ScannedSkill } from '../types.js';

export const LLM_REVIEW_PROMPT_VERSION = '2026-04-28.single-model-v1';

const DEFAULT_CONTEXT_TOKENS = 2048;
const MAX_PROMPT_CHARS = 16_000;
const MAX_SNIPPET_CHARS = 1_200;

const SECRET_PATTERNS: RegExp[] = [
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]{8,}/gi,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

export type LlmReviewSnippet = {
  file: string;
  content: string;
};

export type LlmReviewPayload = {
  promptVersion: string;
  skill: {
    id: string;
    agentId: string;
    name: string;
    path: string;
    installState: string;
  };
  deterministicFindings: Array<{
    ruleId: string;
    severity: string;
    category: string;
    file: string;
    line: number;
    snippet: string;
  }>;
  snippets: LlmReviewSnippet[];
};

function contextCharBudget(contextTokens: number | undefined): number {
  const tokenBudget = contextTokens ?? DEFAULT_CONTEXT_TOKENS;
  return Math.min(MAX_PROMPT_CHARS, Math.max(2_000, tokenBudget * 4));
}

export function redactSecrets(content: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[REDACTED]'),
    content
  );
}

function relativeFindingFile(skillPath: string, finding: Finding): string {
  const rel = relative(skillPath, finding.file);
  if (rel === '' || rel.startsWith('..')) return finding.file;
  return rel;
}

async function readFindingSnippet(skillPath: string, finding: Finding): Promise<LlmReviewSnippet> {
  const fileLabel = relativeFindingFile(skillPath, finding);
  try {
    const content = await readFile(finding.file, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, finding.line - 3);
    const end = Math.min(lines.length, finding.line + 2);
    const excerpt = lines.slice(start, end).join('\n').slice(0, MAX_SNIPPET_CHARS);
    return { file: fileLabel, content: redactSecrets(excerpt) };
  } catch {
    return { file: fileLabel, content: redactSecrets(finding.snippet).slice(0, MAX_SNIPPET_CHARS) };
  }
}

export async function buildLlmReviewPayload(
  skill: ScannedSkill,
  options: { contextTokens?: number } = {}
): Promise<LlmReviewPayload> {
  const budget = contextCharBudget(options.contextTokens);
  let remaining = budget;
  const snippets: LlmReviewSnippet[] = [];

  for (const finding of skill.findings) {
    if (remaining <= 0) break;
    const snippet = await readFindingSnippet(skill.path, finding);
    const capped = snippet.content.slice(0, remaining);
    snippets.push({ ...snippet, content: capped });
    remaining -= capped.length;
  }

  return {
    promptVersion: LLM_REVIEW_PROMPT_VERSION,
    skill: {
      id: skill.id,
      agentId: skill.agentId,
      name: skill.name,
      path: skill.path,
      installState: skill.installState ?? 'installed',
    },
    deterministicFindings: skill.findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      category: finding.category,
      file: relativeFindingFile(skill.path, finding),
      line: finding.line,
      snippet: redactSecrets(finding.snippet).slice(0, 240),
    })),
    snippets,
  };
}

export function buildLlmReviewMessages(payload: LlmReviewPayload): Array<{
  role: 'system' | 'user';
  content: string;
}> {
  return [
    {
      role: 'system',
      content:
        'You are reviewing local AI agent skills for security issues. Return only strict JSON with a findings array. Do not include markdown.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Review this skill for prompt injection, unsafe filesystem or network behavior, credential handling, persistence, and dependency risk. Treat deterministic findings as context, not proof.',
        expected_response: {
          findings: [
            {
              severity: 'critical|high|medium|low|info',
              category: 'prompt-injection|network|filesystem|secrets|persistence|dependency|other',
              confidence: 0.75,
              rationale: 'short reason',
              file: 'optional relative path',
              suggested_fix: 'optional short fix',
            },
          ],
        },
        payload,
      }),
    },
  ];
}
