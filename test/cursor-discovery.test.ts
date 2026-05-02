import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cursorDiscovery from '../packages/cli/src/discovery/cursor.js';

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
