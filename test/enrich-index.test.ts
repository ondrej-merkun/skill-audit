import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../packages/cli/src/types.js';

vi.mock('../packages/cli/src/enrich/skills-sh.js', () => ({
  enrichSkillsSh: vi.fn(),
}));
vi.mock('../packages/cli/src/enrich/github.js', () => ({
  enrichGitHub: vi.fn(),
}));
vi.mock('../packages/cli/src/enrich/deps-dev.js', () => ({
  enrichDepsDev: vi.fn(),
}));

const { enrichSkillsSh } = await import('../packages/cli/src/enrich/skills-sh.js');
const { enrichGitHub } = await import('../packages/cli/src/enrich/github.js');
const { enrichDepsDev } = await import('../packages/cli/src/enrich/deps-dev.js');
const { enrichSkill, enrichAll } = await import('../packages/cli/src/enrich/index.js');

const mockEnrichSkillsSh = vi.mocked(enrichSkillsSh);
const mockEnrichGitHub = vi.mocked(enrichGitHub);
const mockEnrichDepsDev = vi.mocked(enrichDepsDev);

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

describe('enrichAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
