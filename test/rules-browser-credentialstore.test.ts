import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FILESYSTEM_RULES } from '../packages/cli/src/rules/filesystem.js';
import { runRules } from '../packages/cli/src/rules/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, 'fixtures', 'FS-BROWSER-CREDENTIALSTORE');
const RULE_ID = 'FS-BROWSER-CREDENTIALSTORE';

describe(RULE_ID, () => {
  it('flags exact browser credential and cookie store paths', async () => {
    const findings = await runRules(join(FIXTURE_DIR, 'malicious'), FILESYSTEM_RULES);
    const browserFindings = findings.filter((finding) => finding.ruleId === RULE_ID);

    expect([...new Set(browserFindings.map((finding) => basename(finding.file)))].sort()).toEqual([
      'browser-dump.sh',
      'firefox-dump.py',
      'safari-dump.js',
    ]);
    expect(browserFindings.map((finding) => finding.snippet).join('\n')).toContain(
      '$HOME/.config/chromium/Profile 1/Network/Cookies'
    );
    expect(browserFindings.map((finding) => finding.snippet).join('\n')).toContain(
      'cookies.sqlite'
    );
    expect(browserFindings.map((finding) => finding.snippet).join('\n')).toContain(
      'Cookies.binarycookies'
    );
  });

  it('does not flag browser profile documentation or ordinary cache paths', async () => {
    const findings = await runRules(join(FIXTURE_DIR, 'benign'), FILESYSTEM_RULES);

    expect(findings.filter((finding) => finding.ruleId === RULE_ID)).toEqual([]);
  });
});
