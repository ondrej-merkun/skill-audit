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
    tempHome = await mkdtemp(join(tmpdir(), 'skill-audit-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skill-audit-cwd-'));
    originalHome = process.env['HOME'];
    originalSkillauditCwd = process.env['SKILL_AUDIT_CWD'];
    process.env['HOME'] = tempHome;
    process.env['SKILL_AUDIT_CWD'] = tempCwd;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalSkillauditCwd === undefined) {
      delete process.env['SKILL_AUDIT_CWD'];
    } else {
      process.env['SKILL_AUDIT_CWD'] = originalSkillauditCwd;
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

  it('does not count plain plugin manifests from ~/.claude/plugins/ as skills', async () => {
    const pluginDir = join(tempHome, '.claude', 'plugins', 'my-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), '{"name":"my-plugin"}');

    const skills = await claudeCodeDiscovery.discoverSkills();

    expect(skills.find((s) => s.name === 'my-plugin')).toBeUndefined();
  });

  it('discovers nested plugin skills as leaf skills, not marketplace directories', async () => {
    const marketplaceDir = join(tempHome, '.claude', 'plugins', 'marketplace-one');
    const skillDir = join(marketplaceDir, 'review-tools', 'skills', 'review-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Review Skill');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const names = skills.map((s) => s.name);

    expect(names).toContain('review-skill');
    expect(names).not.toContain('marketplace-one');
    expect(names).not.toContain('review-tools');
    expect(skills.find((s) => s.name === 'review-skill')?.format).toBe('SKILL.md');
  });

  it('discovers nested plugin commands and agents', async () => {
    const pluginDir = join(tempHome, '.claude', 'plugins', 'marketplace-one', 'toolkit');
    await mkdir(join(pluginDir, 'commands', 'quality'), { recursive: true });
    await mkdir(join(pluginDir, 'agents'), { recursive: true });
    await writeFile(join(pluginDir, 'commands', 'quality', 'audit.md'), '# Audit Command');
    await writeFile(join(pluginDir, 'agents', 'reviewer.md'), '# Reviewer Agent');

    const skills = await claudeCodeDiscovery.discoverSkills();

    expect(skills.find((s) => s.name === 'audit')?.format).toBe('SKILL.md');
    expect(skills.find((s) => s.name === 'reviewer')?.format).toBe('agents-md');
  });

  it('excludes plugin marketplace inventory by default', async () => {
    const installedDir = join(
      tempHome,
      '.claude',
      'plugins',
      'vendor',
      'installed-tool',
      'skills',
      'installed-review'
    );
    const marketplaceDir = join(
      tempHome,
      '.claude',
      'plugins',
      'marketplaces',
      'vendor',
      'available-tool',
      'skills',
      'marketplace-review'
    );
    await mkdir(installedDir, { recursive: true });
    await mkdir(marketplaceDir, { recursive: true });
    await writeFile(join(installedDir, 'SKILL.md'), '# Installed Review');
    await writeFile(join(marketplaceDir, 'SKILL.md'), '# Marketplace Review');

    const skills = await claudeCodeDiscovery.discoverSkills();

    expect(skills.map((s) => s.name)).toContain('installed-review');
    expect(skills.map((s) => s.name)).not.toContain('marketplace-review');
  });

  it('labels plugin marketplace inventory when explicitly included', async () => {
    const marketplaceDir = join(
      tempHome,
      '.claude',
      'plugins',
      'marketplaces',
      'vendor',
      'available-tool',
      'skills',
      'marketplace-review'
    );
    await mkdir(marketplaceDir, { recursive: true });
    await writeFile(join(marketplaceDir, 'SKILL.md'), '# Marketplace Review');

    const skills = await claudeCodeDiscovery.discoverSkills({ includeMarketplaces: true });
    const marketplaceSkill = skills.find((s) => s.name === 'marketplace-review');

    expect(marketplaceSkill?.installState).toBe('marketplace');
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
    expect(skill?.manifestPath).toMatch(/AGENTS\.md$/);
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

  it('does not count plain .claude-plugin/plugin.json as a skill', async () => {
    const claudePluginDir = join(tempCwd, '.claude-plugin');
    await mkdir(claudePluginDir, { recursive: true });
    await writeFile(join(claudePluginDir, 'plugin.json'), '{"name":"plugin"}');

    const skills = await claudeCodeDiscovery.discoverSkills();

    expect(skills.find((s) => s.path === claudePluginDir)).toBeUndefined();
    expect(skills.find((s) => s.format === 'plugin.json' && s.scope === 'project')).toBeUndefined();
  });

  it('discovers nested skills inside .claude-plugin wrappers', async () => {
    const skillDir = join(tempCwd, '.claude-plugin', 'skills', 'wrapped-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(tempCwd, '.claude-plugin', 'plugin.json'), '{"name":"plugin"}');
    await writeFile(join(skillDir, 'SKILL.md'), '# Wrapped Review');

    const skills = await claudeCodeDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'wrapped-review');

    expect(skill?.format).toBe('SKILL.md');
    expect(skill?.scope).toBe('project');
    expect(skill?.metadata?.sourcePluginName).toBe('plugin');
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
