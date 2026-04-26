/**
 * Fixture-based discovery tests.
 *
 * Each test loads a realistic skill tree from test/fixtures/discovery/<agent>/,
 * plants the content into a temp directory tree, then runs discovery to confirm
 * the expected skills are found. This validates discovery against representative
 * real-world content rather than minimal inline strings.
 */

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import agentsMdSweepDiscovery from '../packages/cli/src/discovery/agents-md-sweep.js';
import claudeCodeDiscovery from '../packages/cli/src/discovery/claude-code.js';
import codexDiscovery from '../packages/cli/src/discovery/codex.js';
import copilotDiscovery from '../packages/cli/src/discovery/copilot.js';
import cursorDiscovery from '../packages/cli/src/discovery/cursor.js';
import geminiDiscovery, {
  parseGeminiExtensionManifest,
} from '../packages/cli/src/discovery/gemini.js';

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

    await cp(join(FIXTURES, 'claude-code', 'plugins'), join(tempHome, '.claude', 'plugins'), {
      recursive: true,
    });

    const versionedCacheSkillDir = join(
      tempHome,
      '.claude',
      'plugins',
      'cache',
      'claude-code-skills',
      'skill-security-auditor',
      '2.2.0'
    );
    await mkdir(versionedCacheSkillDir, { recursive: true });
    await writeFile(
      join(versionedCacheSkillDir, 'SKILL.md'),
      '# Skill Security Auditor\n\nAudit installed skills for security issues.\n'
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

  it('discovers each nested plugin leaf from fixture content', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    for (const skillName of ['proof', 'work', 'review']) {
      expect(byName.get(skillName)?.format).toBe('SKILL.md');
      expect(byName.get(skillName)?.scope).toBe('user');
    }

    expect(byName.has('compound-engineering')).toBe(false);
    expect(byName.get('polish')?.format).toBe('SKILL.md');
    expect(byName.get('reviewer')?.format).toBe('agents-md');

    expect(byName.has('plugins')).toBe(false);
    expect(byName.has('compound-engineering/compound-engineering')).toBe(false);
  });

  it('uses the parent directory name for semver plugin cache leaves', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('skill-security-auditor')?.format).toBe('SKILL.md');
    expect(byName.get('skill-security-auditor')?.path).toContain(
      join('skill-security-auditor', '2.2.0')
    );
    expect(byName.has('2.2.0')).toBe(false);
    expect(byName.get('git-helper')?.format).toBe('SKILL.md');
  });

  it('fixture skill content is reflected in treeSha256', async () => {
    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'git-helper');
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── codex ───────────────────────────────────────────────────────────────────

describe('codex: fixture skill tree', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalCodexHome: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-codex-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-codex-cwd-'));
    originalCodexHome = process.env['CODEX_HOME'];
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['CODEX_HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;

    await writeFile(join(tempHome, 'AGENTS.md'), await fixture('codex', 'AGENTS.md'));
    await writeFile(join(tempHome, 'AGENTS.override.md'), await fixture('codex', 'AGENTS.override.md'));
    await writeFile(join(tempHome, 'config.toml'), await fixture('codex', 'config.toml'));

    const skillDir = join(tempHome, 'skills', 'review-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), await fixture('codex', 'skills', 'review-helper', 'SKILL.md'));

    await cp(join(FIXTURES, 'codex', 'plugins'), join(tempHome, 'plugins'), {
      recursive: true,
    });

    const versionedCacheSkillDir = join(
      tempHome,
      'plugins',
      'cache',
      'openai',
      'enabled-plugin',
      'v1.2.3-beta.1'
    );
    await mkdir(versionedCacheSkillDir, { recursive: true });
    await writeFile(
      join(versionedCacheSkillDir, 'SKILL.md'),
      '# Enabled Plugin\n\nReview active plugin cache payloads.\n'
    );

    const promptsDir = join(tempHome, 'prompts');
    await mkdir(promptsDir, { recursive: true });
    await writeFile(join(promptsDir, 'ship.md'), await fixture('codex', 'prompts', 'ship.md'));

    const projectCodexDir = join(tempCwd, '.codex');
    await mkdir(projectCodexDir, { recursive: true });
    await writeFile(
      join(projectCodexDir, 'config.toml'),
      await fixture('codex', 'project', '.codex', 'config.toml')
    );
  });

  afterEach(async () => {
    if (originalCodexHome === undefined) {
      delete process.env['CODEX_HOME'];
    } else {
      process.env['CODEX_HOME'] = originalCodexHome;
    }
    if (originalCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalCwd;
    }
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  it('uses CODEX_HOME and discovers user AGENTS files', async () => {
    expect(await codexDiscovery.isInstalled()).toBe(true);

    const skills = await codexDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('AGENTS.md')?.format).toBe('agents-md');
    expect(byName.get('AGENTS.override.md')?.format).toBe('agents-md');
    expect(byName.get('AGENTS.md')?.path.startsWith(tempHome)).toBe(true);
  });

  it('discovers one mcp-toml row per user config MCP server', async () => {
    const skills = await codexDiscovery.discoverSkills();
    const mcpNames = skills
      .filter((skill) => skill.format === 'mcp-toml' && skill.scope === 'user')
      .map((skill) => skill.name);

    expect(mcpNames).toEqual(['browser', 'docs']);
  });

  it('discovers user skills, nested plugin leaves, and prompts', async () => {
    const skills = await codexDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('review-helper')?.format).toBe('SKILL.md');
    expect(byName.get('audit-helper')?.format).toBe('SKILL.md');
    expect(byName.get('quick-check')?.format).toBe('prompt-md');
    expect(byName.get('ship')?.format).toBe('prompt-md');

    expect(byName.has('examples')).toBe(false);
    expect(byName.has('plugins')).toBe(false);
    expect(byName.has('openai')).toBe(false);
  });

  it('does not count plain .codex-plugin/plugin.json and still discovers nested leaves', async () => {
    const pluginDir = join(tempCwd, '.codex-plugin');
    const skillDir = join(pluginDir, 'skills', 'project-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), '{"name":"project-plugin"}');
    await writeFile(join(skillDir, 'SKILL.md'), '# Project Helper');

    const skills = await codexDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.has('.codex-plugin')).toBe(false);
    expect(byName.has('project-plugin')).toBe(false);
    expect(byName.get('project-helper')?.format).toBe('SKILL.md');
    expect(byName.get('project-helper')?.scope).toBe('project');
  });

  it('discovers only enabled Codex plugin cache payload leaves', async () => {
    const skills = await codexDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('cache-helper')?.format).toBe('SKILL.md');
    expect(byName.get('cache-command')?.format).toBe('prompt-md');
    expect(byName.get('cache-agent')?.format).toBe('agents-md');
    expect(byName.get('enabled-plugin')?.format).toBe('SKILL.md');
    expect(byName.get('enabled-plugin')?.path).toContain(join('enabled-plugin', 'v1.2.3-beta.1'));
    expect(byName.get('cache-helper')?.path).toContain(
      join('plugins', 'cache', 'openai', 'enabled-plugin')
    );

    expect(byName.has('disabled-helper')).toBe(false);
    expect(byName.has('cache-only-helper')).toBe(false);
    expect(byName.has('rev-1')).toBe(false);
    expect(byName.has('v1.2.3-beta.1')).toBe(false);
  });

  it('emits project-local .codex/config.toml as untrusted project config', async () => {
    const skills = await codexDiscovery.discoverSkills();
    const skill = skills.find((candidate) => candidate.name === '.codex/config.toml');

    expect(skill?.format).toBe('mcp-toml');
    expect(skill?.scope).toBe('project');
    expect(skill?.trusted).toBe(false);
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── gemini ──────────────────────────────────────────────────────────────────

describe('gemini: fixture skill tree', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-gem-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-gem-cwd-'));
    originalHome = process.env['HOME'];
    originalCwd = process.env['SKILLAUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;

    await cp(join(FIXTURES, 'gemini', 'extensions'), join(tempHome, '.gemini', 'extensions'), {
      recursive: true,
    });
    await cp(
      join(FIXTURES, 'gemini', 'project', '.gemini', 'extensions'),
      join(tempCwd, '.gemini', 'extensions'),
      { recursive: true }
    );

    const userCommandsDir = join(tempHome, '.gemini', 'commands', 'ops');
    await mkdir(userCommandsDir, { recursive: true });
    await writeFile(
      join(userCommandsDir, 'doctor.toml'),
      await fixture('gemini', 'commands', 'ops', 'doctor.toml')
    );

    const projectCommandsDir = join(tempCwd, '.gemini', 'commands');
    await mkdir(projectCommandsDir, { recursive: true });
    await writeFile(
      join(projectCommandsDir, 'review.toml'),
      await fixture('gemini', 'project', '.gemini', 'commands', 'review.toml')
    );

    const agentDir = join(tempHome, '.gemini', 'agents', 'planner');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'planner.md'), await fixture('gemini', 'agents', 'planner', 'planner.md'));

    await writeFile(
      join(tempHome, '.gemini', 'settings.json'),
      await fixture('gemini', 'settings.json')
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

  it('parses extension manifest metadata without depending on directory walking', async () => {
    const raw = await fixture('gemini', 'extensions', 'workspace-tools', 'gemini-extension.json');
    const parsed = await parseGeminiExtensionManifest(
      raw,
      join(FIXTURES, 'gemini', 'extensions', 'workspace-tools')
    );

    expect(parsed?.name).toBe('workspace-tools');
    expect(parsed?.metadata.commands).toContain('commands/summarize.toml');
    expect(parsed?.metadata.agents).toContain('agents/reviewer.md');
    expect(parsed?.metadata.mcpServers).toEqual(['browser']);
    expect(parsed?.metadata.warnings).toContain(
      'manifest references missing path: commands/missing.toml'
    );
  });

  it('discovers user extensions, nested commands, agents, and MCP settings', async () => {
    expect(await geminiDiscovery.isInstalled()).toBe(true);

    const skills = await geminiDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('workspace-tools')?.format).toBe('gemini-extension-json');
    expect(byName.get('workspace-tools')?.scope).toBe('user');
    expect(byName.get('doctor')?.format).toBe('gemini-command-toml');
    expect(byName.get('doctor')?.scope).toBe('user');
    expect(byName.get('planner')?.format).toBe('gemini-agent-md');
    expect(byName.get('browser')?.format).toBe('mcp-json');
  });

  it('discovers project-local Gemini extensions and commands without GEMINI.md duplicates', async () => {
    const skills = await geminiDiscovery.discoverSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('project-helper')?.format).toBe('gemini-extension-json');
    expect(byName.get('project-helper')?.scope).toBe('project');
    expect(byName.get('review')?.format).toBe('gemini-command-toml');
    expect(byName.get('review')?.scope).toBe('project');
    expect(byName.has('GEMINI.md')).toBe(false);
  });

  it('keeps manifest-declared nested entries on the extension skill only', async () => {
    const skills = await geminiDiscovery.discoverSkills();
    const extension = skills.find((skill) => skill.name === 'workspace-tools');

    expect(extension?.metadata).toMatchObject({
      commands: ['commands/missing.toml', 'commands/summarize.toml'],
      agents: ['agents/reviewer.md'],
      mcpServers: ['browser'],
    });
    expect(skills.find((skill) => skill.name === 'summarize')).toBeUndefined();
    expect(skills.find((skill) => skill.name === 'reviewer')).toBeUndefined();
    expect(extension?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
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
