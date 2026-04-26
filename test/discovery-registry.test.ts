import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlugins,
  discoverAll,
  initDefaultPlugins,
  isPluginCachePath,
  registerPlugin,
} from '../packages/cli/src/discovery/index.js';
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
    const skill2 = makeSkill({ id: 'skill-2', name: 'Skill Two', treeSha256: 'def456' });

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

  it('runs only the selected discovery plugin when an agent filter is provided', async () => {
    const selectedSkill = makeSkill({ id: 'selected-skill', agentId: 'cursor' });
    const selectedIsInstalled = vi.fn(async () => true);
    const selectedDiscoverSkills = vi.fn(async () => [selectedSkill]);
    const skippedIsInstalled = vi.fn(async () => true);
    const skippedDiscoverSkills = vi.fn(async () => [
      makeSkill({ id: 'skipped-skill', agentId: 'claude-code' }),
    ]);

    registerPlugin({
      id: 'claude-code',
      displayName: 'Claude Code',
      isInstalled: skippedIsInstalled,
      discoverSkills: skippedDiscoverSkills,
    });
    registerPlugin({
      id: 'cursor',
      displayName: 'Cursor',
      isInstalled: selectedIsInstalled,
      discoverSkills: selectedDiscoverSkills,
    });

    const skills = await discoverAll({ agent: 'cursor' });

    expect(skills).toEqual([selectedSkill]);
    expect(selectedIsInstalled).toHaveBeenCalledTimes(1);
    expect(selectedDiscoverSkills).toHaveBeenCalledTimes(1);
    expect(skippedIsInstalled).not.toHaveBeenCalled();
    expect(skippedDiscoverSkills).not.toHaveBeenCalled();
  });

  it('deduplicates non-empty tree hashes and preserves duplicate paths', async () => {
    const laterPath = makeSkill({
      id: 'later-path-skill',
      path: '/tmp/skills/b-primary',
      treeSha256: 'same-tree',
    });
    const earlierPath = makeSkill({
      id: 'earlier-path-skill',
      agentId: 'cursor',
      path: '/tmp/skills/a-duplicate',
      treeSha256: 'same-tree',
    });

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [laterPath],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [earlierPath],
    });

    const skills = await discoverAll();
    expect(skills).toEqual([
      {
        ...earlierPath,
        alsoInstalledAt: ['/tmp/skills/b-primary'],
      },
    ]);
    expect(skills[0]).not.toBe(earlierPath);
    expect(earlierPath).not.toHaveProperty('alsoInstalledAt');
  });

  it('reports discovery progress with deduped skill and unique agent totals', async () => {
    const events: string[] = [];
    const sharedTree = 'same-tree';

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [
        makeSkill({ id: 'skill-a', agentId: 'claude-code', treeSha256: sharedTree }),
      ],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [
        makeSkill({
          id: 'skill-b',
          agentId: 'cursor',
          path: '/tmp/duplicate',
          treeSha256: sharedTree,
        }),
        makeSkill({ id: 'skill-c', agentId: 'codex', treeSha256: 'unique-tree' }),
      ],
    });

    const skills = await discoverAll({
      onProgress: (event) => {
        if (event.type === 'checking-agent') events.push(`checking:${event.agentId}`);
        if (event.type === 'agent-done') events.push(`done:${event.agentId}:${event.skillCount}`);
        if (event.type === 'complete') {
          events.push(`complete:${event.skillCount}:${event.agentCount}`);
        }
      },
    });

    expect(skills).toHaveLength(2);
    expect(events).toEqual([
      'checking:plugin-a',
      'done:plugin-a:1',
      'checking:plugin-b',
      'done:plugin-b:2',
      'complete:2:2',
    ]);
  });

  it('merges preexisting duplicate install paths lexicographically', async () => {
    const primary = makeSkill({
      id: 'primary-skill',
      path: '/tmp/skills/primary',
      treeSha256: 'same-tree',
      alsoInstalledAt: ['/tmp/skills/z-existing', '/tmp/skills/primary'],
    });
    const duplicate = makeSkill({
      id: 'duplicate-skill',
      path: '/tmp/skills/duplicate',
      treeSha256: 'same-tree',
      alsoInstalledAt: ['/tmp/skills/a-existing', '/tmp/skills/z-existing'],
    });

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [primary],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [duplicate],
    });

    const skills = await discoverAll();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.path).toBe('/tmp/skills/a-existing');
    expect(skills[0]?.alsoInstalledAt).toEqual([
      '/tmp/skills/duplicate',
      '/tmp/skills/primary',
      '/tmp/skills/z-existing',
    ]);
  });

  it('prefers a non-cache path as the primary path for deduped plugin skills', async () => {
    const claudeCache = makeSkill({
      id: 'claude-cache-skill',
      agentId: 'claude-code',
      path: '/home/user/.claude/plugins/cache/marketplace/security-helper/SKILL.md',
      treeSha256: 'same-tree',
    });
    const codexCache = makeSkill({
      id: 'codex-cache-skill',
      agentId: 'codex',
      path: '/home/user/.codex/plugins/cache/openai/security-helper/SKILL.md',
      treeSha256: 'same-tree',
    });
    const installedPlugin = makeSkill({
      id: 'installed-plugin-skill',
      agentId: 'claude-code',
      path: '/home/user/.claude/plugins/marketplace/security-helper/skills/audit/SKILL.md',
      treeSha256: 'same-tree',
    });

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [claudeCache],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [codexCache, installedPlugin],
    });

    const skills = await discoverAll();
    expect(skills).toEqual([
      {
        ...installedPlugin,
        alsoInstalledAt: [claudeCache.path, codexCache.path],
      },
    ]);
  });

  it('chooses a deterministic cache path when all duplicate paths are cache paths', async () => {
    const laterCache = makeSkill({
      id: 'later-cache-skill',
      path: '/home/user/.codex/plugins/cache/z-market/security-helper/SKILL.md',
      treeSha256: 'same-tree',
    });
    const earlierCache = makeSkill({
      id: 'earlier-cache-skill',
      path: '/home/user/.claude/plugins/cache/a-market/security-helper/SKILL.md',
      treeSha256: 'same-tree',
    });

    registerPlugin({
      id: 'plugin-a',
      displayName: 'Plugin A',
      isInstalled: async () => true,
      discoverSkills: async () => [laterCache],
    });
    registerPlugin({
      id: 'plugin-b',
      displayName: 'Plugin B',
      isInstalled: async () => true,
      discoverSkills: async () => [earlierCache],
    });

    const skills = await discoverAll();
    expect(skills).toEqual([
      {
        ...earlierCache,
        alsoInstalledAt: [laterCache.path],
      },
    ]);
  });

  it('does not deduplicate empty tree hashes', async () => {
    const skill1 = makeSkill({ id: 'config-a', path: '/tmp/config-a', treeSha256: '' });
    const skill2 = makeSkill({ id: 'config-b', path: '/tmp/config-b', treeSha256: '' });

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
    expect(skills).toEqual([skill1, skill2]);
  });

  it('preserves existing duplicate path annotations on empty tree hashes', async () => {
    const skill1 = makeSkill({
      id: 'config-a',
      path: '/tmp/config-a',
      treeSha256: '',
      alsoInstalledAt: ['/tmp/config-a-alias'],
    });
    const skill2 = makeSkill({
      id: 'config-b',
      path: '/tmp/config-b',
      treeSha256: '',
      alsoInstalledAt: ['/tmp/config-b-alias'],
    });

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
    expect(skills).toEqual([skill1, skill2]);
    expect(skills[0]).not.toBe(skill1);
    expect(skills[0]?.alsoInstalledAt).not.toBe(skill1.alsoInstalledAt);
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

  it('registers Gemini in the default plugin set', async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'skillaudit-reg-home-'));
    const tempCwd = await mkdtemp(join(tmpdir(), 'skillaudit-reg-cwd-'));
    const originalHome = process.env['HOME'];
    const originalCwd = process.env['SKILLAUDIT_CWD'];
    const originalCodexHome = process.env['CODEX_HOME'];

    try {
      process.env['HOME'] = tempHome;
      process.env['SKILLAUDIT_CWD'] = tempCwd;
      process.env['CODEX_HOME'] = join(tempHome, '.codex');

      const commandsDir = join(tempHome, '.gemini', 'commands');
      await mkdir(commandsDir, { recursive: true });
      await writeFile(join(commandsDir, 'audit.toml'), 'description = "Audit workspace"\n');

      initDefaultPlugins();

      const skills = await discoverAll();
      expect(skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: 'gemini',
            name: 'audit',
            format: 'gemini-command-toml',
            scope: 'user',
          }),
        ])
      );
    } finally {
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
      if (originalCodexHome === undefined) {
        delete process.env['CODEX_HOME'];
      } else {
        process.env['CODEX_HOME'] = originalCodexHome;
      }
      await rm(tempHome, { recursive: true, force: true });
      await rm(tempCwd, { recursive: true, force: true });
    }
  });
});

describe('isPluginCachePath', () => {
  it('matches only adjacent plugins/cache path segments', () => {
    expect(isPluginCachePath('/home/user/.claude/plugins/cache/vendor/skill')).toBe(true);
    expect(isPluginCachePath('C:\\Users\\user\\.codex\\plugins\\cache\\vendor\\skill')).toBe(true);

    expect(isPluginCachePath('/home/user/.claude/marketplaces/cache/vendor/skill')).toBe(false);
    expect(isPluginCachePath('/home/user/.claude/skills/cache/vendor/skill')).toBe(false);
    expect(isPluginCachePath('/home/user/.claude/plugins/vendor/cache/skill')).toBe(false);
    expect(isPluginCachePath('/home/user/.claude/plugins/vendor/skills/cache')).toBe(false);
  });
});
