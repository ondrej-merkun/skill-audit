import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import windsurfDiscovery from '../packages/cli/src/discovery/windsurf.js';

async function writeGitRoot(dir: string): Promise<void> {
  await mkdir(join(dir, '.git'), { recursive: true });
  await writeFile(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
}

describe('windsurf discovery plugin', () => {
  let tempHome: string;
  let tempCwd: string;
  let originalHome: string | undefined;
  let originalSkillauditCwd: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'skill-audit-windsurf-home-'));
    tempCwd = await mkdtemp(join(tmpdir(), 'skill-audit-windsurf-cwd-'));
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

  it('isInstalled: false when no Windsurf config or project rules exist', async () => {
    expect(await windsurfDiscovery.isInstalled()).toBe(false);
  });

  it('isInstalled: true when ~/.codeium/windsurf exists', async () => {
    await mkdir(join(tempHome, '.codeium', 'windsurf'), { recursive: true });
    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('isInstalled: true when project-local Windsurf rules exist', async () => {
    await mkdir(join(tempCwd, '.windsurf', 'rules'), { recursive: true });
    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('discovers global Windsurf rules', async () => {
    const memoriesDir = join(tempHome, '.codeium', 'windsurf', 'memories');
    await mkdir(memoriesDir, { recursive: true });
    await writeFile(join(memoriesDir, 'global_rules.md'), '# Global Windsurf rules\n');

    const skills = await windsurfDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'global_rules');

    expect(skill).toBeDefined();
    expect(skill?.agentId).toBe('windsurf');
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('user');
    expect(skill?.manifestPath).toMatch(/global_rules\.md$/);
  });

  it('discovers workspace rules in the current project and subdirectories', async () => {
    const rootRulesDir = join(tempCwd, '.windsurf', 'rules');
    const nestedRulesDir = join(tempCwd, 'apps', 'api', '.windsurf', 'rules');
    await mkdir(rootRulesDir, { recursive: true });
    await mkdir(nestedRulesDir, { recursive: true });
    await writeFile(join(rootRulesDir, 'typescript.md'), '# TypeScript rules\n');
    await writeFile(join(rootRulesDir, 'notes.txt'), 'ignored');
    await writeFile(join(nestedRulesDir, 'backend.md'), '# Backend rules\n');

    const skills = await windsurfDiscovery.discoverSkills();

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: 'windsurf',
          name: 'typescript',
          format: 'rules-md',
          scope: 'project',
        }),
        expect.objectContaining({
          agentId: 'windsurf',
          name: 'backend',
          format: 'rules-md',
          scope: 'project',
        }),
      ])
    );
    expect(skills.find((s) => s.name === 'notes')).toBeUndefined();
  });

  it('discovers parent workspace rules up to the git root', async () => {
    const nestedCwd = join(tempCwd, 'packages', 'cli');
    await writeGitRoot(tempCwd);
    await mkdir(nestedCwd, { recursive: true });
    process.env['SKILL_AUDIT_CWD'] = nestedCwd;

    const rootRulesDir = join(tempCwd, '.windsurf', 'rules');
    await mkdir(rootRulesDir, { recursive: true });
    await writeFile(join(rootRulesDir, 'repo.md'), '# Repo rules\n');

    const skills = await windsurfDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === 'repo');

    expect(skill).toBeDefined();
    expect(skill?.scope).toBe('project');
  });

  it('discovers sibling nested workspace rules from the git root', async () => {
    const nestedCwd = join(tempCwd, 'packages', 'cli');
    await writeGitRoot(tempCwd);
    await mkdir(nestedCwd, { recursive: true });
    process.env['SKILL_AUDIT_CWD'] = nestedCwd;

    const rootRulesDir = join(tempCwd, '.windsurf', 'rules');
    const siblingRulesDir = join(tempCwd, 'apps', 'api', '.windsurf', 'rules');
    await mkdir(rootRulesDir, { recursive: true });
    await mkdir(siblingRulesDir, { recursive: true });
    await writeFile(join(rootRulesDir, 'repo.md'), '# Repo rules\n');
    await writeFile(join(siblingRulesDir, 'api.md'), '# API rules\n');

    const skills = await windsurfDiscovery.discoverSkills();

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: 'windsurf',
          name: 'api',
          format: 'rules-md',
          scope: 'project',
        }),
      ])
    );
  });

  it('does not treat the filesystem root as the workspace root when no git root exists', async () => {
    const nestedCwd = join(tempCwd, 'packages', 'cli');
    await mkdir(nestedCwd, { recursive: true });
    process.env['SKILL_AUDIT_CWD'] = nestedCwd;

    const siblingRulesDir = join(tempCwd, 'apps', 'api', '.windsurf', 'rules');
    await mkdir(siblingRulesDir, { recursive: true });
    await writeFile(join(siblingRulesDir, 'api.md'), '# API rules\n');

    const skills = await windsurfDiscovery.discoverSkills();

    expect(skills.find((s) => s.name === 'api')).toBeUndefined();
  });

  it('isInstalled: true when current workspace has only nested Windsurf rules', async () => {
    const nestedRulesDir = join(tempCwd, 'apps', 'api', '.windsurf', 'rules');
    await mkdir(nestedRulesDir, { recursive: true });
    await writeFile(join(nestedRulesDir, 'backend.md'), '# Backend rules\n');

    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('isInstalled: true when nested rules are deeper than one level', async () => {
    const nestedRulesDir = join(tempCwd, 'apps', 'platform', 'api', '.windsurf', 'rules');
    await mkdir(nestedRulesDir, { recursive: true });
    await writeFile(join(nestedRulesDir, 'platform-api.md'), '# Platform API rules\n');

    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('isInstalled: true when git workspace has only nested Windsurf rules', async () => {
    await writeGitRoot(tempCwd);
    const nestedRulesDir = join(tempCwd, 'apps', 'api', '.windsurf', 'rules');
    await mkdir(nestedRulesDir, { recursive: true });
    await writeFile(join(nestedRulesDir, 'backend.md'), '# Backend rules\n');

    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('isInstalled: true for nested rules outside fixed monorepo folder names', async () => {
    await writeGitRoot(tempCwd);
    const nestedRulesDir = join(tempCwd, 'frontend', 'web', '.windsurf', 'rules');
    await mkdir(nestedRulesDir, { recursive: true });
    await writeFile(join(nestedRulesDir, 'frontend.md'), '# Frontend rules\n');

    expect(await windsurfDiscovery.isInstalled()).toBe(true);
  });

  it('discovers legacy .windsurfrules in the current project', async () => {
    await writeFile(join(tempCwd, '.windsurfrules'), '# Legacy Windsurf rules\n');

    const skills = await windsurfDiscovery.discoverSkills();
    const skill = skills.find((s) => s.name === '.windsurfrules');

    expect(skill).toBeDefined();
    expect(skill?.format).toBe('rules-md');
    expect(skill?.scope).toBe('project');
    expect(skill?.treeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not follow a legacy .windsurfrules symlink', async () => {
    const outsideFile = join(tempHome, 'outside.md');
    await writeFile(outsideFile, '# Outside rules\n');
    await symlink(outsideFile, join(tempCwd, '.windsurfrules'));

    const skills = await windsurfDiscovery.discoverSkills();

    expect(skills.find((s) => s.name === '.windsurfrules')).toBeUndefined();
  });
});
