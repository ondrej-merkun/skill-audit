import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPlugins, discoverAll, registerPlugin } from '../packages/cli/src/discovery/index.js';
import type { AgentDiscovery, Skill } from '../packages/cli/src/types.js';

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'test-id',
  agentId: 'test-agent',
  name: 'Test Skill',
  path: '/tmp/test-skill',
  manifestPath: null,
  format: 'SKILL.md',
  scope: 'user',
  treeSha256: 'abc123',
  ...overrides,
});

afterEach(() => {
  clearPlugins();
});

describe('discoverAll', () => {
  it('returns empty array when no plugins are registered', async () => {
    const skills = await discoverAll();
    expect(skills).toEqual([]);
  });

  it('skips plugins where isInstalled() returns false', async () => {
    const plugin: AgentDiscovery = {
      id: 'not-installed',
      displayName: 'Not Installed',
      isInstalled: async () => false,
      discoverSkills: vi.fn().mockResolvedValue([makeSkill()]),
    };
    registerPlugin(plugin);

    const skills = await discoverAll();
    expect(skills).toEqual([]);
    expect(plugin.discoverSkills).not.toHaveBeenCalled();
  });

  it('collects skills from installed plugins', async () => {
    const skill1 = makeSkill({ id: 'skill-1', name: 'Skill One' });
    const skill2 = makeSkill({ id: 'skill-2', name: 'Skill Two' });

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [skill1],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [skill2],
    });

    const skills = await discoverAll();
    expect(skills).toHaveLength(2);
    expect(skills).toContainEqual(skill1);
    expect(skills).toContainEqual(skill2);
  });

  it('is fail-silent when isInstalled() throws', async () => {
    registerPlugin({
      id: 'broken-check',
      displayName: 'Broken Check',
      isInstalled: async () => { throw new Error('no access'); },
      discoverSkills: async () => [makeSkill()],
    });

    // Should not throw
    const skills = await discoverAll();
    expect(skills).toEqual([]);
  });

  it('is fail-silent when discoverSkills() throws, stderr gets message', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    registerPlugin({
      id: 'broken-discover',
      displayName: 'Broken Discover',
      isInstalled: async () => true,
      discoverSkills: async () => { throw new Error('disk error'); },
    });

    const skills = await discoverAll();
    expect(skills).toEqual([]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('broken-discover'),
    );
    stderrSpy.mockRestore();
  });

  it('still returns skills from healthy plugins when one throws', async () => {
    const goodSkill = makeSkill({ id: 'good-skill' });

    registerPlugin({
      id: 'broken-plugin',
      displayName: 'Broken',
      isInstalled: async () => true,
      discoverSkills: async () => { throw new Error('oops'); },
    });
    registerPlugin({
      id: 'good-plugin',
      displayName: 'Good',
      isInstalled: async () => true,
      discoverSkills: async () => [goodSkill],
    });

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const skills = await discoverAll();
    expect(skills).toContainEqual(goodSkill);
  });
});
