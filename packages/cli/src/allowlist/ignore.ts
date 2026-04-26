import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

function getConfigDir(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

function getIgnoreListPath(): string {
  return join(getConfigDir(), 'skill-audit', 'ignore.yaml');
}

function getLegacyIgnoreListPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(configDir, 'skillaudit', 'ignore.yaml');
}

async function readIgnoreListContent(): Promise<string | null> {
  try {
    return await readFile(getIgnoreListPath(), 'utf-8');
  } catch {
    try {
      return await readFile(getLegacyIgnoreListPath(), 'utf-8');
    } catch {
      return null;
    }
  }
}

// Parse minimal YAML list: lines starting with "  - " hold sha256 hashes.
// Comments after "  - <hash>  # ..." are stripped.
export async function loadIgnoreList(): Promise<Set<string>> {
  const content = await readIgnoreListContent();
  if (content === null) return new Set();

  const hashes = new Set<string>();
  for (const line of content.split('\n')) {
    if (line.startsWith('  - ')) {
      const entry = line.slice(4).split('#')[0]?.trim() ?? '';
      if (entry) hashes.add(entry);
    }
  }
  return hashes;
}

export async function appendToIgnoreList(treeSha256: string, skillName: string): Promise<void> {
  const path = getIgnoreListPath();
  await mkdir(dirname(path), { recursive: true });

  let content =
    (await readIgnoreListContent()) ??
    '# skill-audit ignore list - managed by `skill-audit ignore`\nignored:\n';

  if (content.includes(treeSha256)) return;

  if (!content.endsWith('\n')) content += '\n';
  content += `  - ${treeSha256}  # ${skillName}\n`;
  await writeFile(path, content, 'utf-8');
}
