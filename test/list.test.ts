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

  it('--json output includes path and format fields', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runList({ json: true });
    const arr = JSON.parse(stdoutChunks.join(''));
    expect(arr[0].path).toBeTruthy();
    expect(arr[0].format).toBe('SKILL.md');
    expect(arr[0].tree_sha256).toBe('deadbeef');
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
