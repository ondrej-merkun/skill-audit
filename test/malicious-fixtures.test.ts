import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { ALL_RULES } from '../packages/cli/src/rules/index.js';
import { scoreFindings } from '../packages/cli/src/score.js';

const MALICIOUS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'malicious');

// The rule that each malicious fixture skill exists to prove. The multi-skill scan test only
// checks that some malicious skill has findings, so a skill whose own attack stopped firing
// still passed it. Five of these skills scored PASS for that reason.
const EXPECTED_RULE_BY_FIXTURE: Record<string, string> = {
  'code-execution-skill': 'CODEEXEC-PY-EVAL',
  'credstore-read-skill': 'FS-CREDSTORE',
  'docs-script-installer': 'SKILL-CURL-BASH-IN-MD',
  'env-exfil-skill': 'NET-EXFIL-ENV',
  'hidden-unicode-skill': 'PI-HIDDEN-UNICODE',
  'obfuscated-eval-skill': 'OBFS-EVAL-ATOB',
  'override-instructions-skill': 'PI-OVERRIDE',
  'password-zip-skill': 'SKILL-PASSWORD-ZIP',
  'remote-import-skill': 'DEPS-REMOTE-IMPORT',
  'security-auditor-override': 'PI-OVERRIDE',
  'testing-section-installer': 'SKILL-CURL-BASH-IN-MD',
  'trigger-clause-skill': 'PI-EXFIL-TRIGGER-CLAUSE',
  'webhook-exfil-skill': 'NET-WEBHOOK-KNOWN',
};

describe('malicious fixture skills', () => {
  it('names the expected rule of every malicious fixture skill', () => {
    const fixtureNames = readdirSync(MALICIOUS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(fixtureNames).toEqual(Object.keys(EXPECTED_RULE_BY_FIXTURE).sort());
  });

  it.each(Object.entries(EXPECTED_RULE_BY_FIXTURE))(
    '%s gets its %s finding and is not PASS',
    async (fixture, ruleId) => {
      const findings = await runRules(join(MALICIOUS_DIR, fixture), ALL_RULES);

      expect(findings.map((finding) => finding.ruleId)).toContain(ruleId);
      expect(scoreFindings(findings).verdict).not.toBe('PASS');
    }
  );
});
