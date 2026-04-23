/**
 * Fixture-based discovery tests.
 *
 * Each test loads a realistic skill tree from test/fixtures/discovery/<agent>/,
 * plants the content into a temp directory tree, then runs discovery to confirm
 * the expected skills are found. This validates discovery against representative
 * real-world content rather than minimal inline strings.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import agentsMdSweepDiscovery from '../packages/cli/src/discovery/agents-md-sweep.js';
import claudeCodeDiscovery from '../packages/cli/src/discovery/claude-code.js';
import copilotDiscovery from '../packages/cli/src/discovery/copilot.js';
import cursorDiscovery from '../packages/cli/src/discovery/cursor.js';

const FIXTURES = new URL('./fixtures/discovery', import.meta.url).pathname;

async function fixture(...parts: string[]): Promise<string> {
  return readFile(join(FIXTURES, ...parts), 'utf8');
}

// ── agents-md-sweep ──────────────────────────────────────────────────────────
//
// The fixture cwd contains CLAUDE.md, AGENTS.md, GEMINI.md — no dot dirs
// needed, so we can point SKILLAUDIT_CWD straight at the fixture directory.

describe('agents-md-sweep: fixture skill tree', () => {
  let originalCwd: string | undefined;
  const fixtureCwd = join(FIXTURES, 'agents-md', 'cwd');

  beforeEach(() => {
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['SKILLAUDIT_CWD'] = fixtureCwd;
  });

  afterEach(() => {
    if (originalCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalCwd;
    }
  });

  it('discovers all cross-agent files in the fixture tree', async () => {
    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('CLAUDE.md');
    expect(names).toContain('AGENTS.md');
    expect(names).toContain('GEMINI.md');
  });

  it('assigns agentId cross-agent and format agents-md', async () => {
    const skills = await agentsMdSweepDiscovery.discoverSkills();
    for (const skill of skills) {
      expect(skill.agentId).toBe('cross-agent');
      expect(skill.format).toBe('agents-md');
    }
  });

  it('computes treeSha256 for fixture files', async () => {
    const skills = await agentsMdSweepDiscovery.discoverSkills();
    for (const skill of skills) {
      expect(skill.treeSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

// ── claude-code ──────────────────────────────────────────────────────────────
//
// Fixture content is read from disk and written into a temp dir tree with the
// correct dot-directory structure that the plugin expects.

describe('claude-code: fixture skill tree', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-cc-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-cc-cwd-'));
    originalHome = process.env['HOME'];
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;

    // Plant user-scoped skill from fixture
    const skillDir = join(tempHome, '.claude', 'skills', 'git-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), await fixture('claude-code', 'skills', 'git-helper', 'SKILL.md'));

    // Plant user-scoped command from fixture
    const commandsDir = join(tempHome, '.claude', 'commands');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(join(commandsDir, 'run-tests.md'), await fixture('claude-code', 'commands', 'run-tests.md'));

    // Plant project-scoped skill from fixture
    const cwdSkillDir = join(tempCwd, '.claude', 'skills', 'local-linter');
    await mkdir(cwdSkillDir, { recursive: true });
    await writeFile(
      join(cwdSkillDir, 'SKILL.md'),
      await fixture('claude-code', 'cwd-skills', 'local-linter', 'SKILL.md')
    );
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalCwd;
    }
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  it('discovers the user-scoped git-helper skill from fixture content', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'git-helper');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('claude-code');
  });

  it('discovers the user-scoped run-tests command from fixture content', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'run-tests');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
  });

  it('discovers the project-scoped local-linter skill from fixture content', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'local-linter');
    expect(skill).toBeDefined();
    expect(skill?.scope).toBe('project');
  });

  it('fixture skill content is reflected in treeSha256', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'git-helper');
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── cursor ───────────────────────────────────────────────────────────────────

describe('cursor: fixture skill tree', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-cur-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-cur-cwd-'));
    originalHome = process.env['HOME'];
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;

    // Plant user-scoped rule from fixture
    const userRulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(userRulesDir, { recursive: true });
    await writeFile(
      join(userRulesDir, 'typescript.mdc'),
      await fixture('cursor', 'home', 'rules', 'typescript.mdc')
    );

    // Plant project-scoped rule from fixture
    const cwdRulesDir = join(tempCwd, '.cursor', 'rules');
    await mkdir(cwdRulesDir, { recursive: true });
    await writeFile(
      join(cwdRulesDir, 'no-console.mdc'),
      await fixture('cursor', 'cwd', 'rules', 'no-console.mdc')
    );
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalCwd;
    }
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  it('discovers the user-scoped typescript rule from fixture content', async () => {
    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'typescript');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('cursor');
  });

  it('discovers the project-scoped no-console rule from fixture content', async () => {
    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'no-console');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('project');
  });

  it('fixture rule content is reflected in treeSha256', async () => {
    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'typescript');
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── copilot ──────────────────────────────────────────────────────────────────

describe('copilot: fixture skill tree', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-cop-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-cop-cwd-'));
    originalHome = process.env['HOME'];
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;

    // Plant user-scoped skill from fixture
    const userSkillDir = join(tempHome, '.copilot', 'skills', 'code-reviewer');
    await mkdir(userSkillDir, { recursive: true });
    await writeFile(
      join(userSkillDir, 'SKILL.md'),
      await fixture('copilot', 'user-skills', 'code-reviewer', 'SKILL.md')
    );

    // Plant project-scoped skill from fixture
    const projSkillDir = join(tempCwd, '.github', 'skills', 'ci-helper');
    await mkdir(projSkillDir, { recursive: true });
    await writeFile(
      join(projSkillDir, 'SKILL.md'),
      await fixture('copilot', 'project-skills', 'ci-helper', 'SKILL.md')
    );

    // Plant copilot-instructions.md from fixture
    const githubDir = join(tempCwd, '.github');
    await mkdir(githubDir, { recursive: true });
    await writeFile(
      join(githubDir, 'copilot-instructions.md'),
      await fixture('copilot', 'copilot-instructions.md')
    );

    // Plant *.instructions.md from fixture
    const instrDir = join(tempCwd, '.github', 'instructions');
    await mkdir(instrDir, { recursive: true });
    await writeFile(
      join(instrDir, 'python.instructions.md'),
      await fixture('copilot', 'instructions', 'python.instructions.md')
    );
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalCwd;
    }
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  it('discovers the user-scoped code-reviewer skill from fixture content', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'code-reviewer');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('copilot');
  });

  it('discovers the project-scoped ci-helper skill from fixture content', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'ci-helper');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('project');
  });

  it('discovers copilot-instructions.md from fixture content', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'copilot-instructions');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('project');
  });

  it('discovers python.instructions.md from fixture content', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'python');
    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('project');
  });

  it('fixture skill content is reflected in treeSha256', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'code-reviewer');
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
