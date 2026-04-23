import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import claudeCodeDiscovery from '../packages/cli/src/discovery/claude-code.js';

describe('claude-code discovery plugin', () => {
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

  it('isInstalled: false when ~/.claude does not exist', async () => {
    expect(await claudeCodeDiscovery.isInstalled()).toBe(false);
  });

  it('isInstalled: true when ~/.claude exists', async () => {
    await mkdir(join(tempHome, '.claude'));
    expect(await claudeCodeDiscovery.isInstalled()).toBe(true);
  });

  // --- discoverSkills: user-scoped ---

  it('discovers skills from ~/.claude/skills/', async () => {
    const skillDir = join(tempHome, '.claude', 'skills', 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# My Skill\nDoes stuff.');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-skill');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('claude-code');
    expect(skill?.manifestPath).toMatch(/SKILL\.md$/);
  });

  it('discovers plugins from ~/.claude/plugins/', async () => {
    const pluginDir = join(tempHome, '.claude', 'plugins', 'my-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), '{"name":"my-plugin"}');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-plugin');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('plugin.json');
    expect(skill?.scope).toBe('user');
    expect(skill?.manifestPath).toMatch(/plugin\.json$/);
  });

  it('discovers commands from ~/.claude/commands/', async () => {
    const commandsDir = join(tempHome, '.claude', 'commands');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(join(commandsDir, 'my-command.md'), '# My Command');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-command');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('user');
  });

  it('discovers agents from ~/.claude/agents/', async () => {
    const agentDir = join(tempHome, '.claude', 'agents', 'my-agent');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'AGENTS.md'), '# My Agent');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-agent');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('agents-md');
    expect(skill?.scope).toBe('user');
    expect(skill?.manifestPath).toBeNull();
  });

  // --- discoverSkills: MCP from ~/.claude.json ---

  it('discovers MCP servers from mcpServers in ~/.claude.json', async () => {
    const claudeJson = {
      mcpServers: {
        'my-mcp': { command: 'node', args: ['server.js'] },
      },
    };
    await writeFile(join(tempHome, '.claude.json'), JSON.stringify(claudeJson));

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-mcp');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('mcp-server');
    expect(skill?.scope).toBe('user');
  });

  it('discovers project-specific MCP servers from projects.<path>.mcpServers in ~/.claude.json', async () => {
    const claudeJson = {
      projects: {
        '/some/project': {
          mcpServers: {
            'project-mcp': { command: 'node', args: ['server.js'] },
          },
        },
      },
    };
    await writeFile(join(tempHome, '.claude.json'), JSON.stringify(claudeJson));

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'project-mcp');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('mcp-server');
    expect(skill?.scope).toBe('managed');
  });

  it('silently ignores malformed ~/.claude.json', async () => {
    await writeFile(join(tempHome, '.claude.json'), 'not json {{{');

    const skills = await claudeCodeDiscovery.discoverSkills();
    // no crash; skills from other sources still returned
    expect(Array.isArray(skills)).toBe(true);
  });

  // --- discoverSkills: project-scoped ---

  it('discovers project-local .mcp.json', async () => {
    const mcpJson = {
      mcpServers: {
        'local-mcp': { command: 'node', args: ['server.js'] },
      },
    };
    await writeFile(join(tempCwd, '.mcp.json'), JSON.stringify(mcpJson));

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'local-mcp');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('mcp-server');
    expect(skill?.scope).toBe('project');
  });

  it('discovers project-local skills from .claude/skills/', async () => {
    const skillDir = join(tempCwd, '.claude', 'skills', 'proj-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Project Skill');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'proj-skill');

    expect(skill).toBeDefined();
    expect(skill?.scope).toBe('project');
  });

  it('discovers .claude-plugin/plugin.json', async () => {
    const claudePluginDir = join(tempCwd, '.claude-plugin');
    await mkdir(claudePluginDir, { recursive: true });
    await writeFile(join(claudePluginDir, 'plugin.json'), '{"name":"plugin"}');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.format === 'plugin.json' && s.scope === 'project');

    expect(skill).toBeDefined();
    expect(skill?.manifestPath).toMatch(/plugin\.json$/);
  });

  // --- IDs and structure ---

  it('assigns unique ids to multiple skills', async () => {
    const s1 = join(tempHome, '.claude', 'skills', 'skill-one');
    const s2 = join(tempHome, '.claude', 'skills', 'skill-two');
    await mkdir(s1, { recursive: true });
    await mkdir(s2, { recursive: true });
    await writeFile(join(s1, 'SKILL.md'), '# One');
    await writeFile(join(s2, 'SKILL.md'), '# Two');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array when no skills are installed', async () => {
    await mkdir(join(tempHome, '.claude'));
    const skills = await claudeCodeDiscovery.discoverSkills();
    expect(skills).toEqual([]);
  });

  it('does not throw when ~/.claude subdirs are missing', async () => {
    // Only .claude exists, no subdirs
    await mkdir(join(tempHome, '.claude'));
    await expect(claudeCodeDiscovery.discoverSkills()).resolves.not.toThrow();
  });

  // --- treeSha256 ---

  it('computes a non-empty treeSha256 for skill directories', async () => {
    const skillDir = join(tempHome, '.claude', 'skills', 'hashed-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Hashed Skill');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'hashed-skill');

    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different treeSha256 for skills with different content', async () => {
    const s1 = join(tempHome, '.claude', 'skills', 'skill-a');
    const s2 = join(tempHome, '.claude', 'skills', 'skill-b');
    await mkdir(s1, { recursive: true });
    await mkdir(s2, { recursive: true });
    await writeFile(join(s1, 'SKILL.md'), 'content A');
    await writeFile(join(s2, 'SKILL.md'), 'content B');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const a = skills.find((s) => s.name === 'skill-a');
    const b = skills.find((s) => s.name === 'skill-b');

    expect(a?.treeSha256).not.toBe(b?.treeSha256);
  });
});
