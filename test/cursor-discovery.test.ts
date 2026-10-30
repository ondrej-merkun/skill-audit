import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cursorDiscovery from '../packages/cli/src/discovery/cursor.js';
import type { Skill } from '../packages/cli/src/types.js';

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

// The fields that show which target was found and how the rules read it, in name order.
function summarize(skills: Skill[]) {
  return skills
    .map((skill) => ({
      name: skill.name,
      format: skill.format,
      scope: skill.scope,
      ...(skill.metadata?.ruleScanFilename === undefined
        ? {}
        : { scanName: skill.metadata.ruleScanFilename }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('cursor discovery plugin', () => {
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

  it('isInstalled: false when ~/.cursor does not exist', async () => {
    expect(await cursorDiscovery.isInstalled()).toBe(false);
  });

  it('isInstalled: true when ~/.cursor exists', async () => {
    await mkdir(join(tempHome, '.cursor'));
    expect(await cursorDiscovery.isInstalled()).toBe(true);
  });

  // --- user-scoped MCP from ~/.cursor/mcp.json ---

  it('discovers MCP servers from ~/.cursor/mcp.json', async () => {
    const cursorDir = join(tempHome, '.cursor');
    await mkdir(cursorDir, { recursive: true });
    await writeFile(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'my-mcp': { command: 'node', args: ['server.js'] } } })
    );

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-mcp');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('mcp-server');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('cursor');
  });

  it('silently ignores malformed ~/.cursor/mcp.json', async () => {
    const cursorDir = join(tempHome, '.cursor');
    await mkdir(cursorDir, { recursive: true });
    await writeFile(join(cursorDir, 'mcp.json'), 'not valid json {{{');

    const skills = await cursorDiscovery.discoverSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  // --- user-scoped rules from ~/.cursor/rules/ ---

  it('discovers .mdc rules from ~/.cursor/rules/', async () => {
    const rulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'my-rule.mdc'), '# My Rule\nAlways use TypeScript.');

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'my-rule');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('user');
    expect(skill?.agentId).toBe('cursor');
    expect(skill?.manifestPath).toMatch(/my-rule\.mdc$/);
  });

  it('ignores non-.mdc files in ~/.cursor/rules/', async () => {
    const rulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'readme.txt'), 'ignored');

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'readme');
    expect(skill).toBeUndefined();
  });

  // --- project-scoped MCP from .cursor/mcp.json ---

  it('discovers MCP servers from project-local .cursor/mcp.json', async () => {
    const cursorDir = join(tempCwd, '.cursor');
    await mkdir(cursorDir, { recursive: true });
    await writeFile(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'proj-mcp': { command: 'python', args: ['server.py'] } } })
    );

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'proj-mcp');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('mcp-server');
    expect(skill?.scope).toBe('project');
  });

  // --- project-scoped rules from .cursor/rules/ ---

  it('discovers .mdc rules from project-local .cursor/rules/', async () => {
    const rulesDir = join(tempCwd, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'proj-rule.mdc'), '# Proj Rule');

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'proj-rule');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('project');
  });

  // --- legacy .cursorrules ---

  it('discovers legacy .cursorrules in project root', async () => {
    await writeFile(join(tempCwd, '.cursorrules'), '# Legacy rules\nDo stuff.');

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === '.cursorrules');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('project');
    expect(skill?.manifestPath).toMatch(/\.cursorrules$/);
  });

  it('does not emit .cursorrules entry when file is absent', async () => {
    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === '.cursorrules');
    expect(skill).toBeUndefined();
  });

  // --- skills and subagents in Cursor's own directories ---

  it('discovers nested skills from ~/.cursor/skills and .cursor/skills', async () => {
    await put(join(tempHome, '.cursor', 'skills', 'shipping', 'land-it', 'SKILL.md'), '# Land');
    await put(join(tempCwd, '.cursor', 'skills', 'deploy-web', 'SKILL.md'), '# Deploy');

    const skills = await cursorDiscovery.discoverSkills();

    expect(summarize(skills)).toEqual([
      { name: 'deploy-web', format: 'SKILL.md', scope: 'project' },
      { name: 'land-it', format: 'SKILL.md', scope: 'user' },
    ]);
  });

  it('discovers markdown subagents from ~/.cursor/agents and .cursor/agents', async () => {
    await put(join(tempHome, '.cursor', 'agents', 'security-auditor.md'), '---\nname: a\n---\n');
    await put(join(tempCwd, '.cursor', 'agents', 'reviewer.md'), '---\nname: reviewer\n---\n');
    await put(join(tempCwd, '.cursor', 'agents', 'notes.json'), '{}');

    const skills = await cursorDiscovery.discoverSkills();

    expect(summarize(skills)).toEqual([
      { name: 'reviewer', format: 'agents-md', scope: 'project' },
      { name: 'security-auditor', format: 'agents-md', scope: 'user' },
    ]);
  });

  // --- plugins in ~/.cursor/plugins/local ---

  it('discovers every component of a local Cursor plugin in the default folders', async () => {
    const root = join(tempHome, '.cursor', 'plugins', 'local', 'acme');
    await put(join(root, '.cursor-plugin', 'plugin.json'), JSON.stringify({ name: 'acme-tools' }));
    await put(join(root, 'skills', 'review', 'SKILL.md'), '# Review');
    await put(join(root, 'rules', 'style.mdc'), '# Style');
    await put(join(root, 'agents', 'auditor.md'), '# Auditor');
    await put(join(root, 'commands', 'deploy.txt'), 'Deploy the app.');
    await put(
      join(root, 'hooks', 'hooks.json'),
      JSON.stringify({ hooks: { sessionStart: [{ command: './scripts/start.sh' }] } })
    );
    await put(join(root, 'scripts', 'start.sh'), 'echo start\n');
    await put(
      join(root, 'mcp.json'),
      JSON.stringify({ mcpServers: { db: { command: 'node', args: ['db.js'] } } })
    );
    await put(join(root, 'README.md'), '# Not a component');

    const skills = await cursorDiscovery.discoverSkills();

    expect(summarize(skills)).toEqual([
      { name: 'acme-tools/hooks/hooks.json', format: 'agent-config', scope: 'user', scanName: 'hooks.json' },
      { name: 'acme-tools/scripts/start.sh', format: 'agent-config', scope: 'user', scanName: 'start.sh' },
      { name: 'auditor', format: 'agents-md', scope: 'user' },
      { name: 'deploy', format: 'SKILL.md', scope: 'user', scanName: 'deploy.md' },
      { name: 'plugin-acme-tools-db', format: 'mcp-server', scope: 'user', scanName: '.mcp.json' },
      { name: 'review', format: 'SKILL.md', scope: 'user' },
      { name: 'style', format: 'rules-md', scope: 'user' },
    ]);
    const server = skills.find((skill) => skill.format === 'mcp-server');
    expect(server?.metadata?.ruleScanContent).toContain('db.js');
    expect(skills.find((skill) => skill.name === 'review')?.metadata?.sourcePluginName).toBe(
      'acme-tools'
    );
  });

  it('follows Cursor plugin manifest paths and scans inline hooks in the manifest', async () => {
    const local = join(tempHome, '.cursor', 'plugins', 'local');
    const custom = join(local, 'custom');
    await put(
      join(custom, '.cursor-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'custom',
        skills: './my-skills/',
        hooks: './hooks/hooks-cursor.json',
        mcpServers: '.mcp.json',
      })
    );
    await put(join(custom, 'my-skills', 'chosen', 'SKILL.md'), '# Chosen');
    await put(join(custom, 'skills', 'replaced', 'SKILL.md'), '# Not loaded');
    await put(join(custom, 'hooks', 'hooks-cursor.json'), JSON.stringify({ hooks: {} }));
    await put(join(custom, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }));
    await put(join(custom, '.mcp.json'), JSON.stringify({ mcpServers: { srv: { url: 'https://x' } } }));
    await put(
      join(local, 'inline', '.cursor-plugin', 'plugin.json'),
      JSON.stringify({ name: 'inline', hooks: { hooks: { stop: [{ command: 'echo done' }] } } })
    );
    await put(join(local, 'solo', '.cursor-plugin', 'plugin.json'), JSON.stringify({ name: 'solo' }));
    await put(join(local, 'solo', 'SKILL.md'), '# Single-skill plugin');

    const skills = await cursorDiscovery.discoverSkills();

    expect(summarize(skills)).toEqual([
      { name: 'chosen', format: 'SKILL.md', scope: 'user' },
      { name: 'custom/hooks/hooks-cursor.json', format: 'agent-config', scope: 'user', scanName: 'hooks.json' },
      { name: 'inline/.cursor-plugin/plugin.json', format: 'agent-config', scope: 'user', scanName: 'hooks.json' },
      { name: 'plugin-custom-srv', format: 'mcp-server', scope: 'user', scanName: '.mcp.json' },
      { name: 'solo', format: 'SKILL.md', scope: 'user' },
    ]);
  });

  it('discovers only skills and mcp.json servers of a local Agent Plugin', async () => {
    const root = join(tempHome, '.cursor', 'plugins', 'local', 'portable');
    await put(join(root, 'plugin.json'), JSON.stringify({ name: 'portable' }));
    await put(join(root, 'skills', 'code-reviewer', 'SKILL.md'), '# Reviewer');
    // Plugins load only the skill dirs directly inside skills/.
    await put(join(root, 'skills', 'code-reviewer', 'examples', 'demo', 'SKILL.md'), '# Example');
    await put(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { lint: { command: 'lint' } } }));
    await put(join(root, 'rules', 'ignored.mdc'), '# Agent Plugins do not load rules');

    const skills = await cursorDiscovery.discoverSkills();

    expect(summarize(skills)).toEqual([
      { name: 'code-reviewer', format: 'SKILL.md', scope: 'user' },
      { name: 'plugin-portable-lint', format: 'mcp-server', scope: 'user', scanName: '.mcp.json' },
    ]);
  });

  it('skips plugin payloads that Cursor does not load', async () => {
    const plugins = join(tempHome, '.cursor', 'plugins');
    const cursorPlugin = (root: string) =>
      Promise.all([
        put(join(root, '.cursor-plugin', 'plugin.json'), JSON.stringify({ name: 'p' })),
        put(join(root, 'skills', 'payload', 'SKILL.md'), '# Payload'),
      ]);
    // Marketplace downloads have no install or enable record on disk.
    await cursorPlugin(join(plugins, 'cache', 'cursor-public', 'p', 'abc123'));
    await cursorPlugin(join(plugins, 'marketplaces', 'github.com', 'org', 'p', 'abc123'));
    // Cursor loads a local symlink only when its target is inside the local folder.
    await cursorPlugin(join(tempCwd, 'outside-plugin'));
    await mkdir(join(plugins, 'local'), { recursive: true });
    await symlink(join(tempCwd, 'outside-plugin'), join(plugins, 'local', 'linked'), 'dir');
    // A folder without a manifest is not a plugin.
    await put(join(plugins, 'local', 'no-manifest', 'skills', 'payload', 'SKILL.md'), '# Payload');

    expect(await cursorDiscovery.discoverSkills()).toEqual([]);
  });

  // --- IDs and structure ---

  it('assigns unique ids to multiple skills', async () => {
    const rulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'rule-a.mdc'), 'A');
    await writeFile(join(rulesDir, 'rule-b.mdc'), 'B');

    const skills = await cursorDiscovery.discoverSkills();
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array when no Cursor config exists', async () => {
    const skills = await cursorDiscovery.discoverSkills();
    expect(skills).toEqual([]);
  });

  // --- treeSha256 ---

  it('computes a non-empty treeSha256 for .mdc rule files', async () => {
    const rulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'hashed.mdc'), '# Hashed rule');

    const skills = await cursorDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'hashed');

    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different treeSha256 for rules with different content', async () => {
    const rulesDir = join(tempHome, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, 'rule-x.mdc'), 'content X');
    await writeFile(join(rulesDir, 'rule-y.mdc'), 'content Y');

    const skills = await cursorDiscovery.discoverSkills();
    const x = skills.find((s) => s.name === 'rule-x');
    const y = skills.find((s) => s.name === 'rule-y');

    expect(x?.treeSha256).not.toBe(y?.treeSha256);
  });
});
