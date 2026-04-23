import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import copilotDiscovery from '../packages/cli/src/discovery/copilot.js';

describe('copilot discovery plugin', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalSkillauditCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-cwd-'));
    originalHome = process.env['HOME'];
    originalSkillauditCwd = process.env['SKILLAUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILLAUDIT_CWD'] = tempCwd;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalSkillauditCwd === undefined) {
      delete process.env['SKILLAUDIT_CWD'];
    } else {
      process.env['SKILLAUDIT_CWD'] = originalSkillauditCwd;
    }
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  // --- isInstalled ---

  it('isInstalled: false when ~/.copilot does not exist', async () => {
    expect(await copilotDiscovery.isInstalled()).toBe(false);
  });

  it('isInstalled: true when ~/.copilot exists', async () => {
    await mkdir(join(tempHome, '.copilot'));
    expect(await copilotDiscovery.isInstalled()).toBe(true);
  });

  // --- user-scoped skills from ~/.copilot/skills/*/SKILL.md ---

  it('discovers skills from ~/.copilot/skills/*/SKILL.md', async () => {
    const skillDir = join(tempHome, '.copilot', 'skills', 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# My Skill\nDoes stuff.');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-skill');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('copilot');
    expect(skill?.manifestPath).toMatch(/SKILL\.md$/);
  });

  it('skips skill dirs without SKILL.md under ~/.copilot/skills/', async () => {
    const skillDir = join(tempHome, '.copilot', 'skills', 'no-manifest');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'README.md'), 'no manifest here');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'no-manifest');
    expect(skill).toBeUndefined();
  });

  it('discovers multiple user-scoped skills', async () => {
    const base = join(tempHome, '.copilot', 'skills');
    for (const name of ['skill-a', 'skill-b', 'skill-c']) {
      const dir = join(base, name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), `# ${name}`);
    }

    const skills = await copilotDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('skill-a');
    expect(names).toContain('skill-b');
    expect(names).toContain('skill-c');
  });

  // --- project-scoped skills from .github/skills/*/SKILL.md ---

  it('discovers skills from project-local .github/skills/*/SKILL.md', async () => {
    const skillDir = join(tempCwd, '.github', 'skills', 'proj-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Proj Skill');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'proj-skill');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('project');
    expect(skill?.agentId).toBe('copilot');
  });

  // --- project-scoped .github/copilot-instructions.md ---

  it('discovers .github/copilot-instructions.md', async () => {
    const githubDir = join(tempCwd, '.github');
    await mkdir(githubDir, { recursive: true });
    await writeFile(join(githubDir, 'copilot-instructions.md'), '# Copilot Instructions');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'copilot-instructions');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('project');
    expect(skill?.agentId).toBe('copilot');
    expect(skill?.manifestPath).toMatch(/copilot-instructions\.md$/);
  });

  it('does not emit copilot-instructions entry when file is absent', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'copilot-instructions');
    expect(skill).toBeUndefined();
  });

  // --- project-scoped .github/instructions/*.instructions.md ---

  it('discovers .github/instructions/*.instructions.md files', async () => {
    const instrDir = join(tempCwd, '.github', 'instructions');
    await mkdir(instrDir, { recursive: true });
    await writeFile(join(instrDir, 'python.instructions.md'), '# Python instructions');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'python');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('project');
    expect(skill?.agentId).toBe('copilot');
    expect(skill?.manifestPath).toMatch(/python\.instructions\.md$/);
  });

  it('ignores files that do not end with .instructions.md in .github/instructions/', async () => {
    const instrDir = join(tempCwd, '.github', 'instructions');
    await mkdir(instrDir, { recursive: true });
    await writeFile(join(instrDir, 'readme.md'), 'not an instructions file');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'readme');
    expect(skill).toBeUndefined();
  });

  it('discovers multiple *.instructions.md files', async () => {
    const instrDir = join(tempCwd, '.github', 'instructions');
    await mkdir(instrDir, { recursive: true });
    await writeFile(join(instrDir, 'ts.instructions.md'), '# TS');
    await writeFile(join(instrDir, 'rust.instructions.md'), '# Rust');

    const skills = await copilotDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('ts');
    expect(names).toContain('rust');
  });

  // --- empty / no config ---

  it('returns empty array when no Copilot config exists', async () => {
    const skills = await copilotDiscovery.discoverSkills();
    expect(skills).toEqual([]);
  });

  // --- IDs and structure ---

  it('assigns unique ids to multiple skills', async () => {
    const base = join(tempHome, '.copilot', 'skills');
    for (const name of ['x-skill', 'y-skill']) {
      const dir = join(base, name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), `# ${name}`);
    }

    const skills = await copilotDiscovery.discoverSkills();
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- treeSha256 ---

  it('computes a non-empty treeSha256 for a skill directory', async () => {
    const skillDir = join(tempHome, '.copilot', 'skills', 'hashed-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Hashed Skill');

    const skills = await copilotDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'hashed-skill');

    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different treeSha256 for skills with different content', async () => {
    const base = join(tempHome, '.copilot', 'skills');
    const dirA = join(base, 'sha-skill-a');
    const dirB = join(base, 'sha-skill-b');
    await mkdir(dirA, { recursive: true });
    await mkdir(dirB, { recursive: true });
    await writeFile(join(dirA, 'SKILL.md'), 'content A');
    await writeFile(join(dirB, 'SKILL.md'), 'content B');

    const skills = await copilotDiscovery.discoverSkills();
    const a = skills.find((s) => s.name === 'sha-skill-a');
    const b = skills.find((s) => s.name === 'sha-skill-b');

    expect(a?.treeSha256).not.toBe(b?.treeSha256);
  });
});
