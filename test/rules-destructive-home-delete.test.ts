import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_RULES } from '../packages/cli/src/rules/index.js';
import { runRules } from '../packages/cli/src/rules/engine.js';
import type { Rule } from '../packages/cli/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, 'fixtures', 'FS-DESTRUCTIVE-HOME-DELETE');
const RULE_ID = 'FS-DESTRUCTIVE-HOME-DELETE';

function destructiveHomeDeleteRule(): Rule {
  const rule = ALL_RULES.find((candidate) => candidate.id === RULE_ID);
  expect(rule, `${RULE_ID} must be registered in ALL_RULES`).toBeDefined();
  return rule as Rule;
}

describe(RULE_ID, () => {
  it('is registered as a critical filesystem rule', () => {
    expect(destructiveHomeDeleteRule()).toMatchObject({
      id: RULE_ID,
      category: 'filesystem',
      severity: 'critical',
    });
  });

  it('flags exact destructive home, root, credential-dir, and git-dir delete targets', async () => {
    const findings = await runRules(join(FIXTURE_DIR, 'malicious'), [
      destructiveHomeDeleteRule(),
    ]);

    expect([...new Set(findings.map((finding) => basename(finding.file)))].sort()).toEqual([
      'delete_home.js',
      'delete_home.py',
      'delete_home.sh',
    ]);
    expect(findings.every((finding) => finding.ruleId === RULE_ID)).toBe(true);
  });

  it('does not flag temp/build/cache cleanup or safety documentation', async () => {
    const findings = await runRules(join(FIXTURE_DIR, 'benign'), [
      destructiveHomeDeleteRule(),
    ]);

    expect(findings).toEqual([]);
  });
});
