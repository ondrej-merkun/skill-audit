import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import type { Skill } from '../packages/cli/src/types.js';

vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

import { discoverAll } from '../packages/cli/src/discovery/index.js';
import { runList } from '../packages/cli/src/commands/list.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-abc',
    agentId: 'claude-code',
    name: 'test-skill',
    path: '/home/user/.claude/skills/test-skill',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'deadbeef',
    ...overrides,
  };
}

describe('runList', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(() => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a table with agent, name, path, scope columns', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runList({});
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('claude-code');
    expect(out).toContain('test-skill');
    expect(out).toContain('user');
  });

  it('prints skill count in footer', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill(), makeSkill({ id: 's2', name: 'other' })]);
    await runList({});
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('2 skills found');
  });

  it('shows "No skills found" message when discovery returns empty', async () => {
    vi.mocked(discoverAll).mockResolvedValue([]);
    await runList({});
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('No skills found');
  });

  it('--json emits parseable JSON array', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runList({ json: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
    const arr = JSON.parse(out);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr[0].agent).toBe('claude-code');
    expect(arr[0].name).toBe('test-skill');
    expect(arr[0].scope).toBe('user');
  });

  it('sorts human output by scope before agent, name, and path', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({
        id: 'user-a',
        agentId: 'claude-code',
        name: 'alpha-user',
        path: '/home/user/.claude/skills/alpha-user',
        scope: 'user',
      }),
      makeSkill({
        id: 'project-z',
        agentId: 'cursor',
        name: 'zeta-project',
        path: '/repo/.cursor/rules/zeta-project.mdc',
        scope: 'project',
      }),
      makeSkill({
        id: 'managed-a',
        agentId: 'codex',
        name: 'alpha-managed',
        path: '/home/user/.codex/plugins/alpha-managed',
        scope: 'managed',
      }),
      makeSkill({
        id: 'project-a',
        agentId: 'claude-code',
        name: 'alpha-project',
        path: '/repo/.claude/skills/alpha-project',
        scope: 'project',
      }),
    ]);

    await runList({});
    const out = stripAnsi(stdoutChunks.join(''));

    expect(out.indexOf('alpha-project')).toBeLessThan(out.indexOf('zeta-project'));
    expect(out.indexOf('zeta-project')).toBeLessThan(out.indexOf('alpha-managed'));
    expect(out.indexOf('alpha-managed')).toBeLessThan(out.indexOf('alpha-user'));
  });

  it('sorts JSON output by scope before agent, name, and path', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({
        id: 'user-a',
        agentId: 'claude-code',
        name: 'alpha-user',
        path: '/home/user/.claude/skills/alpha-user',
        scope: 'user',
      }),
      makeSkill({
        id: 'managed-a',
        agentId: 'codex',
        name: 'alpha-managed',
        path: '/home/user/.codex/plugins/alpha-managed',
        scope: 'managed',
      }),
      makeSkill({
        id: 'project-z',
        agentId: 'cursor',
        name: 'zeta-project',
        path: '/repo/.cursor/rules/zeta-project.mdc',
        scope: 'project',
      }),
      makeSkill({
        id: 'project-a',
        agentId: 'claude-code',
        name: 'alpha-project',
        path: '/repo/.claude/skills/alpha-project',
        scope: 'project',
      }),
    ]);

    await runList({ json: true });
    const arr = JSON.parse(stdoutChunks.join(''));

    expect(arr.map((skill: { name: string }) => skill.name)).toEqual([
      'alpha-project',
      'zeta-project',
      'alpha-managed',
      'alpha-user',
    ]);
  });

  it('sorts JSON output by path as the final deterministic tie-breaker', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({
        id: 'project-z-path',
        agentId: 'claude-code',
        name: 'same-name',
        path: '/repo/.claude/skills/z-same-name',
        scope: 'project',
      }),
      makeSkill({
        id: 'project-a-path',
        agentId: 'claude-code',
        name: 'same-name',
        path: '/repo/.claude/skills/a-same-name',
        scope: 'project',
      }),
    ]);

    await runList({ json: true });
    const arr = JSON.parse(stdoutChunks.join(''));

    expect(arr.map((skill: { path: string }) => skill.path)).toEqual([
      '/repo/.claude/skills/a-same-name',
      '/repo/.claude/skills/z-same-name',
    ]);
  });

  it('--json output includes path and format fields', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runList({ json: true });
    const arr = JSON.parse(stdoutChunks.join(''));
    expect(arr[0].path).toBeTruthy();
    expect(arr[0].format).toBe('SKILL.md');
    expect(arr[0].tree_sha256).toBe('deadbeef');
  });

  it('--json emits also_installed_at only when duplicate paths are present', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({
        id: 'deduped',
        alsoInstalledAt: ['/home/user/.cursor/rules/test-skill'],
      }),
      makeSkill({ id: 'unique', name: 'unique-skill', path: '/home/user/.claude/skills/unique' }),
    ]);

    await runList({ json: true });
    const arr = JSON.parse(stdoutChunks.join(''));

    expect(arr[0].also_installed_at).toEqual(['/home/user/.cursor/rules/test-skill']);
    expect(arr[1]).not.toHaveProperty('also_installed_at');
    expect(Object.keys(arr[0]).slice(0, 5)).toEqual([
      'agent',
      'name',
      'path',
      'also_installed_at',
      'tree_sha256',
    ]);
  });

  it('--agent filters to matching agent only', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'cc', agentId: 'claude-code' }),
      makeSkill({ id: 'cur', agentId: 'cursor', name: 'cursor-skill' }),
    ]);
    await runList({ agent: 'claude-code', json: true });
    const arr = JSON.parse(stdoutChunks.join(''));
    expect(arr).toHaveLength(1);
    expect(arr[0].agent).toBe('claude-code');
  });

  it('--agent with no matches outputs empty JSON array', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill({ agentId: 'claude-code' })]);
    await runList({ agent: 'cursor', json: true });
    const arr = JSON.parse(stdoutChunks.join(''));
    expect(arr).toHaveLength(0);
  });
});
