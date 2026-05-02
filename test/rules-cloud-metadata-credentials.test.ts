import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { NETWORK_EXFIL_RULES } from '../packages/cli/src/rules/network-exfil.js';
import type { Rule } from '../packages/cli/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures', 'NET-CLOUD-METADATA-CREDENTIALS');
const RULE_ID = 'NET-CLOUD-METADATA-CREDENTIALS';

function cloudMetadataCredentialsRule(): Rule {
  const rule = NETWORK_EXFIL_RULES.find((candidate) => candidate.id === RULE_ID);
  expect(rule, `${RULE_ID} should be registered`).toBeDefined();
  return rule as Rule;
}

describe(RULE_ID, () => {
  it('detects active credential metadata endpoint requests', async () => {
    const findings = await runRules(join(FIXTURES_DIR, 'malicious'), [
      cloudMetadataCredentialsRule(),
    ]);

    expect([...new Set(findings.map((finding) => basename(finding.file)))].sort()).toEqual([
      'aws-imds.py',
      'azure-imds.sh',
      'ecs-credentials.py',
      'gcp-metadata.js',
    ]);
    expect(findings.every((finding) => finding.ruleId === RULE_ID)).toBe(true);
  });

  it('ignores documentation, comments, and local-only metadata-looking strings', async () => {
    const findings = await runRules(join(FIXTURES_DIR, 'benign'), [
      cloudMetadataCredentialsRule(),
    ]);

    expect(findings).toEqual([]);
  });
});
