import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../packages/cli/src/types.js';

vi.mock('../packages/cli/src/enrich/skills-sh.js', () => ({
  enrichSkillsSh: vi.fn(),
  hasSkillsShQueryInput: vi.fn(),
}));
vi.mock('../packages/cli/src/enrich/github.js', () => ({
  enrichGitHub: vi.fn(),
  hasGitHubQueryInput: vi.fn(),
}));
vi.mock('../packages/cli/src/enrich/deps-dev.js', () => ({
  enrichDepsDev: vi.fn(),
  hasDepsDevQueryInput: vi.fn(),
}));

const { enrichSkillsSh } = await import('../packages/cli/src/enrich/skills-sh.js');
const { hasSkillsShQueryInput } = await import('../packages/cli/src/enrich/skills-sh.js');
const { enrichGitHub } = await import('../packages/cli/src/enrich/github.js');
const { hasGitHubQueryInput } = await import('../packages/cli/src/enrich/github.js');
const { enrichDepsDev } = await import('../packages/cli/src/enrich/deps-dev.js');
const { hasDepsDevQueryInput } = await import('../packages/cli/src/enrich/deps-dev.js');
const {
  enrichSkill,
  enrichSkillWithOutcomes,
  enrichAll,
  skippedEnrichmentOutcomes,
  summarizeEnrichmentOutcomes,
} = await import('../packages/cli/src/enrich/index.js');

const mockEnrichSkillsSh = vi.mocked(enrichSkillsSh);
const mockEnrichGitHub = vi.mocked(enrichGitHub);
const mockEnrichDepsDev = vi.mocked(enrichDepsDev);
const mockHasSkillsShQueryInput = vi.mocked(hasSkillsShQueryInput);
const mockHasGitHubQueryInput = vi.mocked(hasGitHubQueryInput);
const mockHasDepsDevQueryInput = vi.mocked(hasDepsDevQueryInput);

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-skill',
    agentId: 'test',
    name: 'test-skill',
    path: '/tmp/test',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc123',
    ...overrides,
  };
}

describe('enrichSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkillsShQueryInput.mockResolvedValue(true);
    mockHasGitHubQueryInput.mockResolvedValue(true);
    mockHasDepsDevQueryInput.mockResolvedValue(true);
  });

  it('should aggregate enrichment from all three sources', async () => {
    mockEnrichSkillsSh.mockResolvedValue({ gen: 'human', socketAlerts: 0, snyk: 'A' });
    mockEnrichGitHub.mockResolvedValue({ stars: 100, ageDays: 365, contributors: 5 });
    mockEnrichDepsDev.mockResolvedValue({ scorecardScore: 8.5, osvAdvisories: 0 });

    const result = await enrichSkill(makeSkill());

    expect(result.skillsSh).toEqual({ gen: 'human', socketAlerts: 0, snyk: 'A' });
    expect(result.github).toEqual({ stars: 100, ageDays: 365, contributors: 5 });
    expect(result.depsdev).toEqual({ scorecardScore: 8.5, osvAdvisories: 0 });
  });

  it('should return empty object when all sources return null', async () => {
    mockEnrichSkillsSh.mockResolvedValue(null);
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockResolvedValue(null);

    const result = await enrichSkill(makeSkill());

    expect(result).toEqual({});
  });

  it('should omit a field when a source throws', async () => {
    mockEnrichSkillsSh.mockRejectedValue(new Error('network error'));
    mockEnrichGitHub.mockResolvedValue({ stars: 10, ageDays: 30, contributors: 1 });
    mockEnrichDepsDev.mockResolvedValue(null);

    const result = await enrichSkill(makeSkill());

    expect(result.skillsSh).toBeUndefined();
    expect(result.github).toEqual({ stars: 10, ageDays: 30, contributors: 1 });
    expect(result.depsdev).toBeUndefined();
  });

  it('should include only sources that return a non-null value', async () => {
    mockEnrichSkillsSh.mockResolvedValue(null);
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockResolvedValue({ scorecardScore: null, osvAdvisories: 2 });

    const result = await enrichSkill(makeSkill());

    expect(result.skillsSh).toBeUndefined();
    expect(result.github).toBeUndefined();
    expect(result.depsdev).toEqual({ scorecardScore: null, osvAdvisories: 2 });
  });

  it('should call only the requested sources', async () => {
    mockEnrichSkillsSh.mockResolvedValue({ gen: 'low', socketAlerts: 0, snyk: 'low' });
    mockEnrichGitHub.mockResolvedValue({ stars: 10, ageDays: 30, contributors: 1 });
    mockEnrichDepsDev.mockResolvedValue({ scorecardScore: null, osvAdvisories: 0 });

    const result = await enrichSkill(makeSkill(), { sources: ['skillsSh', 'depsdev'] });

    expect(mockEnrichSkillsSh).toHaveBeenCalledOnce();
    expect(mockEnrichGitHub).not.toHaveBeenCalled();
    expect(mockEnrichDepsDev).toHaveBeenCalledOnce();
    expect(result.skillsSh).toEqual({ gen: 'low', socketAlerts: 0, snyk: 'low' });
    expect(result.github).toBeUndefined();
    expect(result.depsdev).toEqual({ scorecardScore: null, osvAdvisories: 0 });
  });
});

describe('enrichSkillWithOutcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkillsShQueryInput.mockResolvedValue(true);
    mockHasGitHubQueryInput.mockResolvedValue(true);
    mockHasDepsDevQueryInput.mockResolvedValue(true);
  });

  it('tracks found data per source', async () => {
    mockEnrichSkillsSh.mockResolvedValue({ gen: 'human', socketAlerts: 0, snyk: 'A' });
    mockEnrichGitHub.mockResolvedValue({ stars: 100, ageDays: 365, contributors: 5 });
    mockEnrichDepsDev.mockResolvedValue({ scorecardScore: 8.5, osvAdvisories: 0 });

    const result = await enrichSkillWithOutcomes(makeSkill());

    expect(result.enrichment.github).toEqual({ stars: 100, ageDays: 365, contributors: 5 });
    expect(result.outcomes).toEqual([
      { source: 'skillsSh', status: 'found' },
      { source: 'github', status: 'found' },
      { source: 'depsdev', status: 'found' },
    ]);
  });

  it('tracks no remote metadata without adding data', async () => {
    mockEnrichSkillsSh.mockResolvedValue(null);
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockResolvedValue(null);

    const result = await enrichSkillWithOutcomes(makeSkill());

    expect(result.enrichment).toEqual({});
    expect(result.outcomes).toEqual([
      { source: 'skillsSh', status: 'no-metadata', reason: 'no metadata found' },
      { source: 'github', status: 'no-metadata', reason: 'no metadata found' },
      { source: 'depsdev', status: 'no-metadata', reason: 'no metadata found' },
    ]);
  });

  it('tracks missing local query input separately from no remote metadata', async () => {
    mockHasSkillsShQueryInput.mockResolvedValue(false);
    mockHasGitHubQueryInput.mockResolvedValue(false);
    mockHasDepsDevQueryInput.mockResolvedValue(false);

    const result = await enrichSkillWithOutcomes(makeSkill());

    expect(mockEnrichSkillsSh).not.toHaveBeenCalled();
    expect(mockEnrichGitHub).not.toHaveBeenCalled();
    expect(mockEnrichDepsDev).not.toHaveBeenCalled();
    expect(result.enrichment).toEqual({});
    expect(result.outcomes).toEqual([
      { source: 'skillsSh', status: 'no-input', reason: 'no local metadata to query' },
      { source: 'github', status: 'no-input', reason: 'no local metadata to query' },
      { source: 'depsdev', status: 'no-input', reason: 'no local metadata to query' },
    ]);
  });

  it('tracks timeout or provider errors as unavailable', async () => {
    mockEnrichSkillsSh.mockRejectedValue(new Error('timeout'));
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockRejectedValue(new Error('network'));

    const result = await enrichSkillWithOutcomes(makeSkill());

    expect(result.outcomes).toEqual([
      { source: 'skillsSh', status: 'unavailable', reason: 'lookup failed or timed out' },
      { source: 'github', status: 'no-metadata', reason: 'no metadata found' },
      { source: 'depsdev', status: 'unavailable', reason: 'lookup failed or timed out' },
    ]);
  });

  it('can summarize no-input, stale-cache, and offline source outcomes', () => {
    expect(
      summarizeEnrichmentOutcomes([
        { source: 'skillsSh', status: 'no-input' },
        { source: 'github', status: 'no-metadata' },
        { source: 'depsdev', status: 'unavailable' },
      ])
    ).toBe('unavailable');
    expect(summarizeEnrichmentOutcomes([{ source: 'github', status: 'stale-cache' }])).toBe(
      'found'
    );
    expect(skippedEnrichmentOutcomes(['skillsSh'])).toEqual([
      { source: 'skillsSh', status: 'skipped-offline', reason: 'offline mode is active' },
    ]);
  });
});

describe('enrichAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkillsShQueryInput.mockResolvedValue(true);
    mockHasGitHubQueryInput.mockResolvedValue(true);
    mockHasDepsDevQueryInput.mockResolvedValue(true);
  });

  it('should return an enrichment object per skill', async () => {
    mockEnrichSkillsSh.mockResolvedValue(null);
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockResolvedValue(null);

    const skills = [makeSkill({ id: 's1' }), makeSkill({ id: 's2' })];
    const results = await enrichAll(skills);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({});
    expect(results[1]).toEqual({});
  });

  it('should run all skills in parallel', async () => {
    const callOrder: string[] = [];
    mockEnrichSkillsSh.mockImplementation(async (s) => {
      callOrder.push(`skillsSh:${s.id}`);
      return null;
    });
    mockEnrichGitHub.mockResolvedValue(null);
    mockEnrichDepsDev.mockResolvedValue(null);

    const skills = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' }), makeSkill({ id: 'c' })];
    await enrichAll(skills, { sources: ['skillsSh'] });

    expect(callOrder).toHaveLength(3);
    expect(callOrder).toContain('skillsSh:a');
    expect(callOrder).toContain('skillsSh:b');
    expect(callOrder).toContain('skillsSh:c');
  });
});
