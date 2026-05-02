import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { DEPENDENCIES_RULES } from '../packages/cli/src/rules/dependencies.js';
import type { Rule } from '../packages/cli/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, 'fixtures', 'MCP-CONFIG-REMOTE-EXEC');
const RULE_ID = 'MCP-CONFIG-REMOTE-EXEC';

function requireRule(): Rule {
  const rule = DEPENDENCIES_RULES.find((candidate) => candidate.id === RULE_ID);
  expect(rule, `${RULE_ID} should be registered in dependency rules`).toBeDefined();
  return rule as Rule;
}

describe(RULE_ID, () => {
  it('detects remote download execution in MCP and Gemini startup configs', async () => {
    const rule = requireRule();
    const findings = [
      ...(await runRules(join(FIXTURE_DIR, 'malicious'), [rule])),
      ...(await runRules(join(FIXTURE_DIR, 'malicious', 'commands', 'doctor.toml'), [rule])),
    ];

    expect([...new Set(findings.map((finding) => basename(finding.file)))].sort()).toEqual([
      '.mcp.json',
      'config.toml',
      'doctor.toml',
      'gemini-extension.json',
      'mcp.json',
      'settings.json',
    ]);
    expect(findings.every((finding) => finding.ruleId === RULE_ID)).toBe(true);
  });

  it('does not flag ordinary local MCP startup commands', async () => {
    const rule = requireRule();
    const findings = [
      ...(await runRules(join(FIXTURE_DIR, 'benign'), [rule])),
      ...(await runRules(join(FIXTURE_DIR, 'benign', 'commands', 'doctor.toml'), [rule])),
    ];

    expect(findings).toEqual([]);
  });

  it('detects remote execution split across formatted args arrays', async () => {
    const rule = requireRule();
    const findings = await runRules(join(FIXTURE_DIR, 'malicious', 'formatted'), [rule]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(RULE_ID);
    expect(basename(findings[0]?.file ?? '')).toBe('mcp.json');
  });
});
