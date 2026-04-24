import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

function getIgnoreListPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(configDir, 'skillaudit', 'ignore.yaml');
}

// Parse minimal YAML list: lines starting with "  - " hold sha256 hashes.
// Comments after "  - <hash>  # ..." are stripped.
export async function loadIgnoreList(): Promise<Set<string>> {
  const path = getIgnoreListPath();
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    return new Set();
  }
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

  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    content = '# skillaudit ignore list — managed by `skillaudit ignore`\nignored:\n';
  }

  if (content.includes(treeSha256)) return;

  if (!content.endsWith('\n')) content += '\n';
  content += `  - ${treeSha256}  # ${skillName}\n`;
  await writeFile(path, content, 'utf-8');
}
