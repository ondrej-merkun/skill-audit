import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendToIgnoreList, loadIgnoreList } from '../packages/cli/src/allowlist/ignore.js';

let tempConfigDir: string;

beforeEach(async () => {
  tempConfigDir = join(
    tmpdir(),
    `skillaudit-ignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tempConfigDir, { recursive: true });
  process.env.XDG_CONFIG_HOME = tempConfigDir;
});

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME;
  await rm(tempConfigDir, { recursive: true, force: true });
});

describe('loadIgnoreList', () => {
  it('should return empty set when file does not exist', async () => {
    const result = await loadIgnoreList();
    expect(result.size).toBe(0);
  });

  it('should parse sha256 entries from YAML list', async () => {
    const skillauditDir = join(tempConfigDir, 'skillaudit');
    await mkdir(skillauditDir, { recursive: true });
    await writeFile(
      join(skillauditDir, 'ignore.yaml'),
      '# skillaudit ignore list\nignored:\n  - abc123  # my-skill\n  - def456  # other-skill\n',
      'utf-8'
    );
    const result = await loadIgnoreList();
    expect(result.has('abc123')).toBe(true);
    expect(result.has('def456')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('should strip inline comments from entries', async () => {
    const skillauditDir = join(tempConfigDir, 'skillaudit');
    await mkdir(skillauditDir, { recursive: true });
    await writeFile(
      join(skillauditDir, 'ignore.yaml'),
      'ignored:\n  - sha256withcomment  # comment here\n',
      'utf-8'
    );
    const result = await loadIgnoreList();
    expect(result.has('sha256withcomment')).toBe(true);
    expect(result.has('sha256withcomment  # comment here')).toBe(false);
  });
});

describe('appendToIgnoreList', () => {
  it('should create the file and directory if they do not exist', async () => {
    await appendToIgnoreList('newhash123', 'my-skill');
    const result = await loadIgnoreList();
    expect(result.has('newhash123')).toBe(true);
  });

  it('should append to an existing file', async () => {
    await appendToIgnoreList('first111', 'skill-one');
    await appendToIgnoreList('second222', 'skill-two');
    const result = await loadIgnoreList();
    expect(result.has('first111')).toBe(true);
    expect(result.has('second222')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('should be idempotent — duplicate hashes are not added twice', async () => {
    await appendToIgnoreList('dupehash', 'my-skill');
    await appendToIgnoreList('dupehash', 'my-skill');
    const result = await loadIgnoreList();
    expect(result.has('dupehash')).toBe(true);
    expect(result.size).toBe(1);
  });
});
