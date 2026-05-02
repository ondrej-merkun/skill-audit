import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runScan } from '../packages/cli/src/commands/scan.js';

const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url));
const MALICIOUS_DIR = join(FIXTURES_DIR, 'malicious');
const BENIGN_DIR = join(FIXTURES_DIR, 'benign');

type JsonFinding = {
  rule_id: string;
  severity: string;
  category: string;
  file: string;
  message: string;
};

type JsonSkill = {
  id: string;
  agent_id: string;
  name: string;
  path: string;
  install_state: string;
  also_installed_at?: string[];
  modified_at?: string;
  tree_sha256: string;
  findings: JsonFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    score: number;
    verdict: string;
  };
};

type JsonOutput = {
  schema_version: string;
  skills: JsonSkill[];
  summary: {
    skills_scanned: number;
    compromised: number;
    percent_compromised: number;
    verdict: string;
  };
};

const maliciousSkills = [
  'env-exfil-skill',
  'password-zip-skill',
  'trigger-clause-skill',
  'hidden-unicode-skill',
  'obfuscated-eval-skill',
  'credstore-read-skill',
  'webhook-exfil-skill',
  'remote-import-skill',
  'override-instructions-skill',
  'code-execution-skill',
];

const benignSkills = [
  'pdf-extractor',
  'git-helper',
  'kanban',
  'ffmpeg-wrapper',
  'date-parser',
  'csv-processor',
  'json-validator',
  'markdown-formatter',
  'docker-helper',
  'test-runner',
];

describe('runScan: multi-skill fixture coverage', () => {
  let tempHome: string;
  let tempCwd: string;
  let skillsDir: string;
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skill-audit-scan-multi-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skill-audit-scan-multi-cwd-'));
    skillsDir = join(tempHome, '.claude', 'skills');
    await mkdir(skillsDir, { recursive: true });

    originalHome = process.env['HOME'];
    originalUserProfile = process.env['USERPROFILE'];
    originalCwd = process.env['SKILL_AUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['USERPROFILE'] = tempHome;
    process.env['SKILL_AUDIT_CWD'] = tempCwd;

    stdoutChunks = [];
    stderrChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env['USERPROFILE'];
    } else {
      process.env['USERPROFILE'] = originalUserProfile;
    }
    if (originalCwd === undefined) {
      delete process.env['SKILL_AUDIT_CWD'];
    } else {
      process.env['SKILL_AUDIT_CWD'] = originalCwd;
    }
    process.exitCode = undefined;
    vi.restoreAllMocks();
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  async function copySkills(kindDir: string, names: string[]): Promise<void> {
    for (const name of names) {
      await cp(join(kindDir, name), join(skillsDir, name), { recursive: true });
    }
  }

  it('produces findings for malicious skills', async () => {
    await copySkills(MALICIOUS_DIR, maliciousSkills);

    await runScan({ json: true, offline: true, agent: 'claude-code' });

    expect(process.exitCode).toBe(1);
    expect(stderrChunks.join('')).toBe('');

    const result = JSON.parse(stdoutChunks.join('')) as JsonOutput;
    expect(result.schema_version).toBe('1.0');
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.filter((s) => s.findings.length > 0).length).toBeGreaterThan(0);
    expect(result.summary.skills_scanned).toBeGreaterThan(0);
    expect(result.summary.compromised).toBeGreaterThan(0);
  });

  it('produces no critical findings for benign skills', async () => {
    await copySkills(BENIGN_DIR, benignSkills);

    await runScan({ json: true, offline: true, agent: 'claude-code' });

    expect(process.exitCode).toBeUndefined();
    expect(stderrChunks.join('')).toBe('');

    const result = JSON.parse(stdoutChunks.join('')) as JsonOutput;
    expect(result.schema_version).toBe('1.0');
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.filter((s) => s.summary.verdict === 'FAIL')).toHaveLength(0);
    expect(result.summary.compromised).toBe(0);
  });
});
