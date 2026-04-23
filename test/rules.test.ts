import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { CODE_EXECUTION_RULES } from '../packages/cli/src/rules/code-execution.js';
import { NETWORK_EXFIL_RULES } from '../packages/cli/src/rules/network-exfil.js';
import { FILESYSTEM_RULES } from '../packages/cli/src/rules/filesystem.js';
import { PROMPT_INJECTION_RULES } from '../packages/cli/src/rules/prompt-injection.js';
import { GIT_HISTORY_RULES } from '../packages/cli/src/rules/git-history.js';
import { DEPENDENCIES_RULES } from '../packages/cli/src/rules/dependencies.js';
import { OBFUSCATION_RULES } from '../packages/cli/src/rules/obfuscation.js';
import { SKILL_SPECIFIC_RULES } from '../packages/cli/src/rules/skill-specific.js';
import { SECRETS_RULES } from '../packages/cli/src/rules/secrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

const ALL_RULES = [
  ...CODE_EXECUTION_RULES,
  ...NETWORK_EXFIL_RULES,
  ...FILESYSTEM_RULES,
  ...PROMPT_INJECTION_RULES,
  ...GIT_HISTORY_RULES,
  ...DEPENDENCIES_RULES,
  ...OBFUSCATION_RULES,
  ...SKILL_SPECIFIC_RULES,
  ...SECRETS_RULES,
];

describe('rule fixtures', () => {
  for (const rule of ALL_RULES) {
    const ruleDir = join(FIXTURES_DIR, rule.id);
    if (!existsSync(ruleDir)) continue;

    describe(rule.id, () => {
      const maliciousDir = join(ruleDir, 'malicious');
      const benignDir = join(ruleDir, 'benign');

      if (existsSync(maliciousDir)) {
        it('fires on malicious fixture', async () => {
          const findings = await runRules(maliciousDir, [rule]);
          expect(findings.length).toBeGreaterThan(0);
          expect(findings.every((f) => f.ruleId === rule.id)).toBe(true);
        });
      }

      if (existsSync(benignDir)) {
        it('does not fire on benign fixture', async () => {
          const findings = await runRules(benignDir, [rule]);
          expect(findings).toEqual([]);
        });
      }
    });
  }
});
