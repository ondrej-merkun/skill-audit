/**
 * E2E tests: spawns the compiled CLI binary against fixture skill trees
 * and asserts expected verdicts and JSON structure.
 *
 * Requires: `pnpm build` must have run before these tests execute.
 * In CI, the workflow runs build before test.
 */

import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../packages/cli/dist/index.js', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('fixtures', import.meta.url));
const MALICIOUS_DIR = join(FIXTURES_DIR, 'malicious');
const BENIGN_DIR = join(FIXTURES_DIR, 'benign');

type CliResult = { stdout: string; stderr: string; code: number };

async function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<CliResult> {
  const captureDir = await mkdtemp(join(tmpdir(), 'skillaudit-cli-capture-'));
  const stdoutPath = join(captureDir, 'stdout');
  const stderrPath = join(captureDir, 'stderr');
  let stdoutHandle: FileHandle | undefined = await open(stdoutPath, 'w');
  let stderrHandle: FileHandle | undefined = await open(stderrPath, 'w');

  try {
    const result = spawnSync('node', [CLI, ...args], {
      env: { ...process.env, ...extraEnv },
      timeout: 60_000,
      stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
    });

    await stdoutHandle.close();
    await stderrHandle.close();
    stdoutHandle = undefined;
    stderrHandle = undefined;

    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf-8'),
      readFile(stderrPath, 'utf-8'),
    ]);

    return {
      stdout,
      stderr: result.error === undefined ? stderr : `${stderr}${result.error.message}`,
      code: result.status ?? 1,
    };
  } finally {
    await stdoutHandle?.close().catch(() => undefined);
    await stderrHandle?.close().catch(() => undefined);
    await rm(captureDir, { recursive: true, force: true });
  }
}

// JSON output field shapes (snake_case — matches renderJson output)
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
  also_installed_at?: string[];
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
  scan: { started_at: string; duration_ms: number; tool_version: string };
  agents: Array<{ id: string; installed: boolean; skills_scanned: number }>;
  skills: JsonSkill[];
  summary: {
    skills_scanned: number;
    compromised: number;
    percent_compromised: number;
    verdict: string;
  };
};

describe('e2e: CLI binary', () => {
  it('--version prints a semver string', async () => {
    const { stdout, code } = await runCli(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help prints usage', async () => {
    const { stdout, code } = await runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('scan');
  });
});

describe('e2e: scan malicious fixtures', () => {
  let tempHome: string;
  let tempCwd: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-cwd-'));
    skillsDir = join(tempHome, '.claude', 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

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

  it(
    'produces findings for malicious skills',
    async () => {
      for (const name of maliciousSkills) {
        await cp(join(MALICIOUS_DIR, name), join(skillsDir, name), { recursive: true });
      }

      const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
      const { stdout, code } = await runCli(
        ['scan', '--json', '--offline', '--agent', 'claude-code'],
        env
      );

      // Exit code 1 = at least one REVIEW or FAIL skill
      expect(code).toBe(1);

      const result = JSON.parse(stdout) as JsonOutput;

      expect(result.schema_version).toBe('1.0');
      expect(Array.isArray(result.skills)).toBe(true);
      expect(result.skills.length).toBeGreaterThan(0);

      // At least one malicious skill should have findings
      const withFindings = result.skills.filter((s) => s.findings.length > 0);
      expect(withFindings.length).toBeGreaterThan(0);

      // Summary reports at least one compromised
      expect(result.summary.skills_scanned).toBeGreaterThan(0);
      expect(result.summary.compromised).toBeGreaterThan(0);
    },
    60_000
  );

  it('JSON schema has required top-level fields', async () => {
    const name = maliciousSkills[0];
    await cp(join(MALICIOUS_DIR, name), join(skillsDir, name), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { stdout } = await runCli(
      ['scan', '--json', '--offline', '--agent', 'claude-code'],
      env
    );

    const result = JSON.parse(stdout) as JsonOutput;
    expect(result.schema_version).toBe('1.0');
    expect(result).toHaveProperty('scan');
    expect(result).toHaveProperty('agents');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('summary');
  });

  it('each scanned skill has required fields', async () => {
    const name = maliciousSkills[0];
    await cp(join(MALICIOUS_DIR, name), join(skillsDir, name), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { stdout } = await runCli(
      ['scan', '--json', '--offline', '--agent', 'claude-code'],
      env
    );

    const result = JSON.parse(stdout) as JsonOutput;
    const skill = result.skills[0];
    expect(skill).toHaveProperty('id');
    expect(skill).toHaveProperty('agent_id');
    expect(skill).toHaveProperty('name');
    expect(skill).toHaveProperty('path');
    expect(skill).toHaveProperty('tree_sha256');
    expect(skill).toHaveProperty('findings');
    expect(skill).toHaveProperty('summary');
    expect(skill.summary).toHaveProperty('verdict');
    expect(skill.summary).toHaveProperty('score');
  });
});

describe('e2e: scan benign fixtures', () => {
  let tempHome: string;
  let tempCwd: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-cwd-'));
    skillsDir = join(tempHome, '.claude', 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

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

  it(
    'produces no critical findings for benign skills',
    async () => {
      for (const name of benignSkills) {
        await cp(join(BENIGN_DIR, name), join(skillsDir, name), { recursive: true });
      }

      const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
      const { stdout, code } = await runCli(
        ['scan', '--json', '--offline', '--agent', 'claude-code'],
        env
      );

      // All benign → exit code 0
      expect(code).toBe(0);

      const result = JSON.parse(stdout) as JsonOutput;

      expect(result.schema_version).toBe('1.0');
      expect(result.skills.length).toBeGreaterThan(0);

      // No skill should have a FAIL verdict
      // (REVIEW from subprocess calls is acceptable static-analysis noise)
      const failed = result.skills.filter((s) => s.summary.verdict === 'FAIL');
      expect(failed.length).toBe(0);

      // Summary shows 0 compromised (only FAIL counts as compromised)
      expect(result.summary.compromised).toBe(0);
    },
    60_000
  );

  it('exit code 0 for a single clearly-safe skill', async () => {
    await cp(join(BENIGN_DIR, 'date-parser'), join(skillsDir, 'date-parser'), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { code } = await runCli(['scan', '--offline', '--agent', 'claude-code'], env);
    expect(code).toBe(0);
  });
});

describe('e2e: scan flags', () => {
  let tempHome: string;
  let tempCwd: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-e2e-cwd-'));
    skillsDir = join(tempHome, '.claude', 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  it('--deep exits with code 2 and prints coming-soon message', async () => {
    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { code, stderr } = await runCli(['scan', '--deep'], env);
    expect(code).toBe(2);
    expect(stderr).toContain('Deep mode coming soon');
  });

  it('--json outputs valid JSON for a benign skill', async () => {
    // Put one benign skill so the CLI has something to scan
    await cp(join(BENIGN_DIR, 'date-parser'), join(skillsDir, 'date-parser'), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { stdout, code } = await runCli(
      ['scan', '--json', '--offline', '--agent', 'claude-code'],
      env
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout) as JsonOutput;
    expect(result.schema_version).toBe('1.0');
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.skills.length).toBe(1);
  });

  it('--strict is accepted as a flag without tool error', async () => {
    await cp(join(BENIGN_DIR, 'date-parser'), join(skillsDir, 'date-parser'), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };
    const { code } = await runCli(
      ['scan', '--offline', '--strict', '--agent', 'claude-code'],
      env
    );
    // Code 0 or 1 — not 2 (tool error)
    expect(code).toBeLessThan(2);
  });

  it('--fail-on review promotes exit code threshold', async () => {
    await cp(join(BENIGN_DIR, 'date-parser'), join(skillsDir, 'date-parser'), { recursive: true });

    const env = { HOME: tempHome, USERPROFILE: tempHome, SKILLAUDIT_CWD: tempCwd };

    // With all-PASS benign skill: --fail-on review should still be 0 if verdict is PASS
    const { code } = await runCli(
      ['scan', '--offline', '--fail-on', 'review', '--agent', 'claude-code'],
      env
    );
    // PASS verdict → exit 0 regardless of --fail-on review
    expect(code).toBe(0);
  });
});
