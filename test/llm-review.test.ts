import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildLlmReviewPayload, redactSecrets } from '../packages/cli/src/llm/prompt.js';
import { parseLlmReviewResponse } from '../packages/cli/src/llm/review.js';
import type { Finding, ScannedSkill } from '../packages/cli/src/types.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

function makeFinding(file: string): Finding {
  return {
    ruleId: 'SEC-HARDCODED-KEY',
    severity: 'high',
    category: 'secrets',
    file,
    line: 2,
    column: 1,
    snippet: 'const token = "sk-123456789012345678901234"',
    message: 'Hardcoded key.',
    fix: 'Use secret storage.',
    cwe: ['CWE-798'],
  };
}

function makeScannedSkill(root: string, finding: Finding): ScannedSkill {
  return {
    id: 'skill-abc',
    agentId: 'claude-code',
    name: 'review-me',
    path: root,
    manifestPath: join(root, 'SKILL.md'),
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc',
    findings: [finding],
    enrichment: {},
    summary: {
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
      score: 90,
      verdict: 'REVIEW',
      mandatoryFail: [],
      allowlisted: false,
    },
  };
}

describe('LLM review prompt and parsing', () => {
  it('caps context to finding-driving files and redacts obvious secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-audit-llm-review-'));
    tempRoots.push(root);
    const nested = join(root, 'src');
    await mkdir(nested, { recursive: true });
    const file = join(nested, 'tool.js');
    await writeFile(
      file,
      [
        'export function run() {',
        '  const token = "sk-123456789012345678901234";',
        '  return token;',
        '}',
      ].join('\n'),
      'utf-8'
    );
    await writeFile(join(root, 'unrelated.txt'), 'do not send me', 'utf-8');

    const payload = await buildLlmReviewPayload(makeScannedSkill(root, makeFinding(file)), {
      contextTokens: 600,
    });

    expect(payload.snippets).toHaveLength(1);
    expect(payload.snippets[0]).toMatchObject({ file: 'src/tool.js' });
    expect(payload.snippets[0]?.content).toContain('[REDACTED]');
    expect(JSON.stringify(payload)).not.toContain('sk-123456789012345678901234');
    expect(JSON.stringify(payload)).not.toContain('do not send me');
  });

  it('redacts common token assignment forms', () => {
    expect(redactSecrets('api_key = "abcdef1234567890"')).toContain('[REDACTED]');
  });

  it('strictly parses structured model findings', () => {
    const findings = parseLlmReviewResponse(
      JSON.stringify({
        findings: [
          {
            severity: 'medium',
            category: 'prompt-injection',
            confidence: 0.82,
            rationale: 'The instruction asks the model to ignore policy.',
            file: 'SKILL.md',
            suggested_fix: 'Remove the override instruction.',
          },
        ],
      })
    );

    expect(findings).toEqual([
      {
        severity: 'medium',
        category: 'prompt-injection',
        confidence: 0.82,
        rationale: 'The instruction asks the model to ignore policy.',
        file: 'SKILL.md',
        suggestedFix: 'Remove the override instruction.',
      },
    ]);
  });

  it('rejects markdown and malformed finding severities', () => {
    expect(parseLlmReviewResponse('```json\n{"findings":[]}\n```')).toBeNull();
    expect(
      parseLlmReviewResponse(
        JSON.stringify({ findings: [{ severity: 'urgent', category: 'x', confidence: 1 }] })
      )
    ).toBeNull();
  });
});
