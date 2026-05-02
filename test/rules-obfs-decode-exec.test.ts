import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { OBFUSCATION_RULES } from '../packages/cli/src/rules/obfuscation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, 'fixtures', 'OBFS-DECODE-EXEC');
const rule = OBFUSCATION_RULES.find((candidate) => candidate.id === 'OBFS-DECODE-EXEC');

describe('OBFS-DECODE-EXEC', () => {
  it('flags high-signal decode-and-execute shell and PowerShell patterns', async () => {
    expect(rule).toBeDefined();

    const findings = await runRules(join(FIXTURE_DIR, 'malicious'), [rule!]);

    expect(new Set(findings.map((finding) => finding.file.split('/').at(-1)))).toEqual(
      new Set(['decode-and-run.sh', 'decode-and-run.ps1'])
    );
    expect(findings.every((finding) => finding.ruleId === 'OBFS-DECODE-EXEC')).toBe(true);
  });

  it('does not flag benign decoding or PowerShell documentation that avoids execution', async () => {
    expect(rule).toBeDefined();

    const findings = await runRules(join(FIXTURE_DIR, 'benign'), [rule!]);

    expect(findings).toEqual([]);
  });
});
