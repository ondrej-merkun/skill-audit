import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'gemini';

type GeminiExtensionMetadata = {
  commands: string[];
  agents: string[];
  mcpServers: string[];
  warnings: string[];
};

type GeminiExtensionParseResult = {
  name: string | null;
  metadata: GeminiExtensionMetadata;
};

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function getCwd(): string {
  return process.env.SKILLAUDIT_CWD ?? process.cwd();
}

function makeId(input: string): string {
  return createHash('sha256').update(`${AGENT_ID}:${input}`).digest('hex').slice(0, 16);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function namesFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(namesFromUnknown);
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (!isRecord(value)) {
    return [];
  }

  const named = value.name ?? value.id ?? value.path ?? value.file;
  if (typeof named === 'string') {
    return [named];
  }

  return Object.keys(value);
}

function pathRefsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(pathRefsFromUnknown);
  }

  if (typeof value === 'string') {
    return value.includes('/') || value.includes('\\') || value.includes('.') ? [value] : [];
  }

  if (!isRecord(value)) {
    return [];
  }

  const refs: string[] = [];
  for (const key of ['path', 'file']) {
    const candidate = value[key];
    if (typeof candidate === 'string') refs.push(candidate);
  }
  return refs;
}

async function missingPathWarnings(manifestDir: string, declared: unknown): Promise<string[]> {
  const warnings: string[] = [];
  for (const ref of pathRefsFromUnknown(declared)) {
    if (!(await pathExists(join(manifestDir, ref)))) {
      warnings.push(`manifest references missing path: ${ref}`);
    }
  }
  return warnings;
}

export async function parseGeminiExtensionManifest(
  raw: string,
  manifestDir: string
): Promise<GeminiExtensionParseResult | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const commands = [...new Set(namesFromUnknown(parsed.commands))].sort((a, b) =>
    a.localeCompare(b)
  );
  const agents = [...new Set(namesFromUnknown(parsed.agents))].sort((a, b) => a.localeCompare(b));
  const mcpServers = [...new Set(namesFromUnknown(parsed.mcpServers))].sort((a, b) =>
    a.localeCompare(b)
  );
  const warnings = [
    ...(await missingPathWarnings(manifestDir, parsed.commands)),
    ...(await missingPathWarnings(manifestDir, parsed.agents)),
  ];

  return {
    name: typeof parsed.name === 'string' ? parsed.name : null,
    metadata: { commands, agents, mcpServers, warnings },
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ isDirectory(): boolean; isFile(): boolean; name: string }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function discoverExtensionManifests(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = (await walkFiles(dir)).filter((file) => basename(file) === 'gemini-extension.json');
  const skills: Skill[] = [];

  for (const manifestPath of files) {
    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }

    const extensionDir = dirname(manifestPath);
    const parsed = await parseGeminiExtensionManifest(raw, extensionDir);
    if (parsed === null) continue;

    skills.push({
      id: makeId(extensionDir),
      agentId: AGENT_ID,
      name: parsed.name ?? basename(extensionDir),
      path: extensionDir,
      manifestPath,
      format: 'gemini-extension-json',
      scope,
      treeSha256: await computeTreeSha256(extensionDir),
      metadata: parsed.metadata,
    });
  }

  return skills;
}

async function discoverCommandTomlFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = (await walkFiles(dir)).filter((file) => file.endsWith('.toml'));
  return Promise.all(
    files.map(async (filePath) => ({
      id: makeId(filePath),
      agentId: AGENT_ID,
      name: basename(filePath, '.toml'),
      path: filePath,
      manifestPath: filePath,
      format: 'gemini-command-toml' as const,
      scope,
      treeSha256: await computeTreeSha256(filePath),
    }))
  );
}

async function discoverAgentMarkdownFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = (await walkFiles(dir)).filter((file) => file.endsWith('.md'));
  return Promise.all(
    files.map(async (filePath) => ({
      id: makeId(filePath),
      agentId: AGENT_ID,
      name: basename(filePath, '.md'),
      path: filePath,
      manifestPath: filePath,
      format: 'gemini-agent-md' as const,
      scope,
      treeSha256: await computeTreeSha256(filePath),
    }))
  );
}

async function discoverMcpJson(settingsPath: string, scope: Skill['scope']): Promise<Skill[]> {
  let raw: string;
  try {
    raw = await readFile(settingsPath, 'utf8');
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return [];

  return Object.keys(parsed.mcpServers)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: makeId(`${settingsPath}:${name}`),
      agentId: AGENT_ID,
      name,
      path: settingsPath,
      manifestPath: settingsPath,
      format: 'mcp-json' as const,
      scope,
      treeSha256: '',
    }));
}

const geminiDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Gemini CLI',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.gemini'));
  },

  async discoverSkills(): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const userBase = join(home, '.gemini');
    const projectBase = join(cwd, '.gemini');
    const skills: Skill[] = [];

    skills.push(...(await discoverExtensionManifests(join(userBase, 'extensions'), 'user')));
    skills.push(...(await discoverCommandTomlFiles(join(userBase, 'commands'), 'user')));
    skills.push(...(await discoverAgentMarkdownFiles(join(userBase, 'agents'), 'user')));
    skills.push(...(await discoverMcpJson(join(userBase, 'settings.json'), 'user')));

    skills.push(...(await discoverExtensionManifests(join(projectBase, 'extensions'), 'project')));
    skills.push(...(await discoverCommandTomlFiles(join(projectBase, 'commands'), 'project')));

    return skills;
  },
};

export default geminiDiscovery;
