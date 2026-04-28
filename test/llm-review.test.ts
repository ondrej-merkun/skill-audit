import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLlmReviewMessages,
  buildLlmReviewPayload,
  redactSecrets,
} from '../packages/cli/src/llm/prompt.js';
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

  it('does not put enum placeholder findings in the prompt', () => {
    const messages = buildLlmReviewMessages({
      promptVersion: 'test',
      skill: {
        id: 'skill-abc',
        agentId: 'claude-code',
        name: 'review-me',
        path: '/tmp/review-me',
        installState: 'installed',
      },
      deterministicFindings: [],
      snippets: [],
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).not.toContain('critical|high|medium|low|info');
    expect(serialized).not.toContain('prompt-injection|network|filesystem');
    expect(serialized).not.toContain('optional relative path');
    const userMessage = messages.find((message) => message.role === 'user');
    expect(userMessage).toBeDefined();
    expect(JSON.parse(userMessage?.content ?? '{}').output_contract.no_findings).toEqual({
      findings: [],
    });
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
        JSON.stringify({
          findings: [
            { severity: 'urgent', category: 'x', confidence: 1, rationale: 'Specific issue.' },
          ],
        })
      )
    ).toBeNull();
  });

  it('drops schema/no-finding echoes copied from the prompt contract', () => {
    expect(
      parseLlmReviewResponse(
        JSON.stringify({
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
        })
      )
    ).toEqual([]);
    expect(
      parseLlmReviewResponse(
        JSON.stringify({
          findings: [
            {
              severity: 'high',
              category: 'prompt-injection|network|filesystem',
              confidence: 0.75,
              rationale: 'Specific reason.',
            },
          ],
        })
      )
    ).toBeNull();
  });

  it('accepts local model findings with empty optional fields and extra metadata', () => {
    const findings = parseLlmReviewResponse(
      JSON.stringify({
        findings: [
          {
            severity: 'critical',
            category: 'filesystem',
            confidence: 0.75,
            rationale: 'Use correct SSH key.',
            file: 'references/common_errors.md',
            suggested_fix:
              '# Use correct SSH key\nansible-playbook -i inventory playbook.yml --private-key=~/.ssh/id_rsa',
          },
          {
            severity: 'low',
            category: 'dependency',
            confidence: 0.8,
            rationale:
              'The skill uses Ansible, which is not explicitly listed in the dependencies.',
            file: '',
            suggested_fix:
              'Update the dependency to a specific version or use a more secure package manager.',
          },
          {
            file: 'scripts/shellcheck_wrapper.sh',
            line: 94,
            category: 'dependency',
            severity: 'medium',
            confidence: 0.8,
            rationale:
              'The script attempts to install shellcheck-py using pip3, which may not be available on all systems.',
            suggested_fix: 'Check if shellcheck-py is installed before attempting to install it.',
          },
        ],
      })
    );

    expect(findings).toEqual([
      {
        severity: 'critical',
        category: 'filesystem',
        confidence: 0.75,
        rationale: 'Use correct SSH key.',
        file: 'references/common_errors.md',
        suggestedFix:
          '# Use correct SSH key\nansible-playbook -i inventory playbook.yml --private-key=~/.ssh/id_rsa',
      },
      {
        severity: 'low',
        category: 'dependency',
        confidence: 0.8,
        rationale: 'The skill uses Ansible, which is not explicitly listed in the dependencies.',
        suggestedFix:
          'Update the dependency to a specific version or use a more secure package manager.',
      },
      {
        severity: 'medium',
        category: 'dependency',
        confidence: 0.8,
        rationale:
          'The script attempts to install shellcheck-py using pip3, which may not be available on all systems.',
        file: 'scripts/shellcheck_wrapper.sh',
        suggestedFix: 'Check if shellcheck-py is installed before attempting to install it.',
      },
    ]);
  });

  it('maps common local model category aliases and default confidence', () => {
    const findings = parseLlmReviewResponse(
      JSON.stringify({
        findings: [
          {
            file: 'scripts/install_tools.sh',
            line: 49,
            category: 'network-exfil',
            severity: 'high',
            confidence: 0.9,
            rationale: 'Uses non-local curl command to download act.',
            suggested_fix: 'Use a local URL for the act installation script.',
          },
          {
            file: 'config.json',
            category: 'credentials',
            suggested_fix: 'update to use secure storage',
            rationale: 'insecure credential storage',
            severity: 'medium',
          },
        ],
      })
    );

    expect(findings).toEqual([
      {
        severity: 'high',
        category: 'network',
        confidence: 0.9,
        rationale: 'Uses non-local curl command to download act.',
        file: 'scripts/install_tools.sh',
        suggestedFix: 'Use a local URL for the act installation script.',
      },
      {
        severity: 'medium',
        category: 'secrets',
        confidence: 0.5,
        rationale: 'insecure credential storage',
        file: 'config.json',
        suggestedFix: 'update to use secure storage',
      },
    ]);
  });

  it('normalizes no-issue placeholder findings to no findings', () => {
    expect(
      parseLlmReviewResponse(
        JSON.stringify({
          findings: [
            {
              severity: 'info',
              category: 'other',
              confidence: 0,
              rationale: '',
              file: '',
              suggested_fix: '',
            },
            {
              file: '',
              suggested_fix: '',
              category: 'other',
              confidence: 1,
              rationale: 'No additional issues found.',
              severity: 'info',
            },
            {
              file: 'marketplace.md',
              suggested_fix: '',
              category: 'prompt-injection',
              severity: 'info',
              confidence: 0,
              rationale: 'No prompt injection vulnerability found in the marketplace skill.',
            },
          ],
        })
      )
    ).toEqual([]);
  });
});
