import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import agentsMdSweepDiscovery from '../packages/cli/src/discovery/agents-md-sweep.js';

describe('agents-md-sweep discovery plugin', () => {
  let tempBase: string;
  let tempCwd: string;
  let originalSkillauditCwd: string | undefined;

  beforeEach(async () => {
    tempBase = await mkdtemp(join(tmpdir(), 'skillaudit-sweep-base-'));
    tempCwd = join(tempBase, 'project');
    await mkdir(tempCwd, { recursive: true });
    originalSkillauditCwd = process.env['SKILLAUDIT_CWD'];
    process.env['SKILLAUDIT_CWD'] = tempCwd;
  });

  afterEach(async () => {
    if (originalSkillauditCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalSkillauditCwd;
    }
    await rm(tempBase, { recursive: true, force: true });
  });

  // --- isInstalled ---

  it('isInstalled: always returns true', async () => {
    expect(await agentsMdSweepDiscovery.isInstalled()).toBe(true);
  });

  // --- discovery in cwd ---

  it('discovers CLAUDE.md in cwd', async () => {
    await writeFile(join(tempCwd, 'CLAUDE.md'), '# Claude instructions');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'CLAUDE.md');

    expect(skill).toBeDefined();
    expect(skill?.agentId).toBe('cross-agent');
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('project');
    expect(skill?.manifestPath).toMatch(/CLAUDE\.md$/);
  });

  it('discovers AGENTS.md in cwd', async () => {
    await writeFile(join(tempCwd, 'AGENTS.md'), '# Agents config');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'AGENTS.md');

    expect(skill).toBeDefined();
    expect(skill?.agentId).toBe('cross-agent');
  });

  it('discovers .cursorrules in cwd', async () => {
    await writeFile(join(tempCwd, '.cursorrules'), 'always use TypeScript');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === '.cursorrules');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
  });

  it('discovers all target filenames', async () => {
    const targets = [
      'AGENTS.md',
      'AGENTS.override.md',
      'CLAUDE.md',
      'GEMINI.md',
      '.cursorrules',
      '.windsurfrules',
      'CONVENTIONS.md',
    ];
    for (const filename of targets) {
      await writeFile(join(tempCwd, filename), `# ${filename}`);
    }

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);

    for (const filename of targets) {
      expect(names).toContain(filename);
    }
  });

  // --- discovery in parent directories ---

  it('discovers CLAUDE.md in a parent directory', async () => {
    await writeFile(join(tempBase, 'CLAUDE.md'), '# Root Claude config');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'CLAUDE.md');

    expect(skill).toBeDefined();
    expect(skill?.path).toBe(join(tempBase, 'CLAUDE.md'));
  });

  it('discovers files from both cwd and parent', async () => {
    await writeFile(join(tempCwd, 'AGENTS.md'), '# Project agents');
    await writeFile(join(tempBase, 'CLAUDE.md'), '# Root claude');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);

    expect(names).toContain('AGENTS.md');
    expect(names).toContain('CLAUDE.md');
  });

  it('discovers CLAUDE.md in both cwd and parent when both exist', async () => {
    await writeFile(join(tempCwd, 'CLAUDE.md'), 'project level');
    await writeFile(join(tempBase, 'CLAUDE.md'), 'root level');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const claudeSkills = skills.filter((s) => s.name === 'CLAUDE.md');

    // Both files are different paths — both get emitted
    expect(claudeSkills).toHaveLength(2);
    const paths = claudeSkills.map((s) => s.path);
    expect(paths).toContain(join(tempCwd, 'CLAUDE.md'));
    expect(paths).toContain(join(tempBase, 'CLAUDE.md'));
  });

  // --- absent files ---

  it('returns empty array when no target files exist', async () => {
    const skills = await agentsMdSweepDiscovery.discoverSkills();
    expect(skills).toEqual([]);
  });

  it('does not emit skills for non-target filenames', async () => {
    await writeFile(join(tempCwd, 'README.md'), '# Readme');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    expect(skills.find((s) => s.name === 'README.md')).toBeUndefined();
  });

  // --- IDs and structure ---

  it('assigns unique ids to multiple discovered files', async () => {
    await writeFile(join(tempCwd, 'CLAUDE.md'), 'a');
    await writeFile(join(tempCwd, 'AGENTS.md'), 'b');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- treeSha256 ---

  it('computes a non-empty treeSha256 for discovered files', async () => {
    await writeFile(join(tempCwd, 'CLAUDE.md'), '# Claude instructions');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'CLAUDE.md');

    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different treeSha256 for files with different content', async () => {
    await writeFile(join(tempCwd, 'CLAUDE.md'), 'content A');
    await writeFile(join(tempCwd, 'AGENTS.md'), 'content B');

    const skills = await agentsMdSweepDiscovery.discoverSkills();
    const claude = skills.find((s) => s.name === 'CLAUDE.md');
    const agents = skills.find((s) => s.name === 'AGENTS.md');

    expect(claude?.treeSha256).not.toBe(agents?.treeSha256);
  });
});
