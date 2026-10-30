import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { enterDirOnce, isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import type { Skill } from '../types.js';
import { discoverAgentConfigFiles, mcpServerScanMetadata } from './agent-config.js';
import { discoverSkillDirs } from './shared-agent-skills.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'cursor';

// Cursor loads every plugin in this folder after a reload, unless an Enterprise admin turns off
// local plugin imports. Marketplace installs land in ~/.cursor/plugins/cache, but Cursor keeps no
// install or enable record next to them, so the cache is inventory and is not scanned.
const LOCAL_PLUGINS_DIR = join('.cursor', 'plugins', 'local');
// The plugins live under the home directory.
const PLUGIN_SCOPE: Skill['scope'] = 'user';

// A Cursor Plugin has the first manifest. An Agent Plugin (the open standard) has the second.
const CURSOR_PLUGIN_MANIFEST = join('.cursor-plugin', 'plugin.json');
const AGENT_PLUGIN_MANIFEST = 'plugin.json';

// Hook and settings rules match this name, whatever name the plugin gives its hooks file.
const HOOKS_SCAN_NAME = 'hooks.json';
// Cursor expands this placeholder to the plugin root in plugin hook commands.
const PLUGIN_ROOT_PLACEHOLDER = 'CURSOR_PLUGIN_ROOT';

// Prompt-file extensions that Cursor reads. Markdown rules match `*.md` and `*.mdc` only, so the
// other extensions get a `.md` scan name.
const MARKDOWN_EXTENSIONS = ['.md', '.mdc', '.markdown'];
const RULE_MATCHED_EXTENSIONS = new Set(['.md', '.mdc']);

export const CURSOR_AGENTS: MarkdownComponent = {
  format: 'agents-md',
  extensions: MARKDOWN_EXTENSIONS,
};
const CURSOR_RULES: MarkdownComponent = { format: 'rules-md', extensions: MARKDOWN_EXTENSIONS };
// As for Claude Code commands, each command file is a one-file skill.
const CURSOR_COMMANDS: MarkdownComponent = {
  format: 'SKILL.md',
  extensions: [...MARKDOWN_EXTENSIONS, '.txt'],
};

/** Discovers the components of each plugin in ~/.cursor/plugins/local. */
export async function discoverCursorLocalPlugins(home: string): Promise<Skill[]> {
  const localDir = join(home, LOCAL_PLUGINS_DIR);
  const realLocalDir = await realPathOrUndefined(localDir);
  if (realLocalDir === undefined) return [];

  const pluginDirs = (await readDirFollowingLinks(localDir))
    .filter((entry) => entry.kind === 'dir')
    .map((entry) => join(localDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
  const skills: Skill[] = [];

  for (const root of pluginDirs) {
    // Cursor skips a symlinked plugin whose target is outside the local folder.
    const realRoot = await realPathOrUndefined(root);
    if (realRoot === undefined || !isBelow(realLocalDir, realRoot)) continue;

    skills.push(...(await discoverPlugin(root)));
  }

  return skills;
}

/**
 * Emits each prompt file of one component kind: a listed file, or a file at any depth below a
 * listed directory.
 * ponytail: Cursor does not document whether it reads subdirectories of agents/, rules/, or
 * commands/, so the walk reads them all.
 */
export async function discoverMarkdownComponent(
  paths: string[],
  component: MarkdownComponent,
  scope: Skill['scope'],
  metadata?: Skill['metadata']
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const path of paths) {
    for (const file of await componentFiles(path)) {
      if (component.extensions.includes(extname(file))) {
        skills.push(await markdownSkill(file, component.format, scope, metadata));
      }
    }
  }

  return skills;
}

async function discoverPlugin(root: string): Promise<Skill[]> {
  const cursorManifest = await readManifest(join(root, CURSOR_PLUGIN_MANIFEST));
  if (cursorManifest !== undefined) {
    return discoverCursorPlugin(localPlugin(root, cursorManifest), cursorManifest);
  }

  const agentManifest = await readManifest(join(root, AGENT_PLUGIN_MANIFEST));
  if (agentManifest !== undefined) return discoverAgentPlugin(localPlugin(root, agentManifest));

  // Cursor recognizes a plugin only by its manifest.
  return [];
}

/**
 * A Cursor Plugin reads each component from the paths that its manifest names, or from the
 * default location when the manifest names none. A manifest path replaces the default location.
 */
async function discoverCursorPlugin(plugin: LocalPlugin, manifest: Manifest): Promise<Skill[]> {
  const paths = (field: unknown, defaultPath: string) =>
    componentPaths(plugin.root, field, defaultPath);
  const markdown = (field: unknown, defaultPath: string, component: MarkdownComponent) =>
    discoverMarkdownComponent(paths(field, defaultPath), component, PLUGIN_SCOPE, plugin.metadata);

  const configFiles = paths(manifest.hooks, join('hooks', 'hooks.json'));
  if (hasInlineConfig(manifest)) configFiles.push(join(plugin.root, CURSOR_PLUGIN_MANIFEST));

  return [
    ...(await discoverCursorPluginSkills(plugin, manifest.skills)),
    ...(await markdown(manifest.rules, 'rules', CURSOR_RULES)),
    ...(await markdown(manifest.agents, 'agents', CURSOR_AGENTS)),
    ...(await markdown(manifest.commands, 'commands', CURSOR_COMMANDS)),
    ...(await discoverPluginConfigFiles(plugin, configFiles)),
    ...(await discoverPluginMcpFiles(plugin, paths(manifest.mcpServers, 'mcp.json'))),
  ];
}

/** The Agent Plugins standard has fixed locations: skills/ and a root mcp.json. */
async function discoverAgentPlugin(plugin: LocalPlugin): Promise<Skill[]> {
  return [
    ...(await discoverPluginSkills(plugin, [join(plugin.root, 'skills')])),
    ...(await discoverPluginMcpFiles(plugin, [join(plugin.root, 'mcp.json')])),
  ];
}

/**
 * A root SKILL.md makes a single-skill plugin, but only when the plugin has no skills/ dir and
 * the manifest names no skill paths.
 */
async function discoverCursorPluginSkills(plugin: LocalPlugin, field: unknown): Promise<Skill[]> {
  const isSingleSkill =
    field === undefined &&
    !(await isDirectory(join(plugin.root, 'skills'))) &&
    (await isRegularFile(join(plugin.root, 'SKILL.md')));
  if (!isSingleSkill) {
    return discoverPluginSkills(plugin, componentPaths(plugin.root, field, 'skills'));
  }

  const skills = await discoverPluginSkills(plugin, [plugin.root]);
  return skills.filter((skill) => skill.path === plugin.root);
}

/**
 * Plugins load a listed skill dir and the skill dirs directly inside it. A deeper SKILL.md, such
 * as an example under skills/<skill>/examples/, is not a loaded skill.
 */
async function discoverPluginSkills(plugin: LocalPlugin, dirs: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const dir of dirs) {
    const found = await discoverSkillDirs(AGENT_ID, dir, PLUGIN_SCOPE);
    skills.push(...found.filter((skill) => skill.path === dir || dirname(skill.path) === dir));
  }

  return skills.map((skill) => ({ ...skill, metadata: plugin.metadata }));
}

/** Emits each hooks file, and the scripts below the plugin root that its hooks run. */
async function discoverPluginConfigFiles(plugin: LocalPlugin, files: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const file of files) {
    skills.push(
      ...(await discoverAgentConfigFiles({
        agentId: AGENT_ID,
        dir: dirname(file),
        displayDir: posix.join(plugin.name, toPosix(relative(plugin.root, dirname(file)))),
        fileNames: [basename(file)],
        scope: PLUGIN_SCOPE,
        metadata: { ...plugin.metadata, ruleScanFilename: HOOKS_SCAN_NAME },
        // Plugin hook commands name scripts relative to the plugin root, e.g. ./scripts/run.sh.
        scriptRoot: {
          dir: plugin.root,
          displayDir: plugin.name,
          placeholder: PLUGIN_ROOT_PLACEHOLDER,
          isWorkingDir: true,
        },
      }))
    );
  }

  return skills;
}

/** Emits one entry per server, and each entry scans only its own server definition. */
async function discoverPluginMcpFiles(plugin: LocalPlugin, files: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const file of files) {
    for (const [server, definition] of Object.entries(await readMcpServers(file))) {
      skills.push({
        id: makeId(`${file}:${server}`),
        agentId: AGENT_ID,
        // Cursor shows a plugin server as plugin-<plugin>-<server>.
        name: `plugin-${plugin.name}-${server}`,
        path: file,
        manifestPath: file,
        format: 'mcp-server',
        scope: PLUGIN_SCOPE,
        treeSha256: '',
        metadata: { ...mcpServerScanMetadata(server, definition), ...plugin.metadata },
      });
    }
  }

  return skills;
}

/**
 * Inline hooks and inline MCP servers in the manifest run like the ones in a hooks file, so the
 * manifest is scanned as a hooks file too.
 * ponytail: inline MCP servers get no entry of their own; the manifest entry carries their
 * findings.
 */
function hasInlineConfig(manifest: Manifest): boolean {
  const mcpServers = Array.isArray(manifest.mcpServers)
    ? manifest.mcpServers
    : [manifest.mcpServers];

  return isRecord(manifest.hooks) || mcpServers.some(isRecord);
}

/**
 * Resolves a manifest component field (a path or an array of paths) against the plugin root.
 * ponytail: paths are not limited to the plugin root. The Cursor submission rules forbid `..`
 * and absolute paths, but the docs do not say how the loader treats them.
 */
function componentPaths(root: string, field: unknown, defaultPath: string): string[] {
  if (field === undefined) return [join(root, defaultPath)];

  const values = Array.isArray(field) ? field : [field];
  return values.filter((value) => typeof value === 'string').map((value) => resolve(root, value));
}

async function markdownSkill(
  file: string,
  format: Skill['format'],
  scope: Skill['scope'],
  metadata?: Skill['metadata']
): Promise<Skill> {
  const extension = extname(file);
  const name = basename(file, extension);
  const scanMetadata = RULE_MATCHED_EXTENSIONS.has(extension)
    ? metadata
    : { ...metadata, ruleScanFilename: `${name}.md` };

  return {
    id: makeId(file),
    agentId: AGENT_ID,
    name,
    path: file,
    manifestPath: file,
    format,
    scope,
    treeSha256: await computeTreeSha256(file),
    ...(scanMetadata === undefined ? {} : { metadata: scanMetadata }),
  };
}

function localPlugin(root: string, manifest: Manifest): LocalPlugin {
  const manifestName = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  const name = manifestName === '' ? basename(root) : manifestName;
  return { root, name, metadata: { sourcePluginName: name } };
}

async function readManifest(path: string): Promise<Manifest | undefined> {
  const parsed = await readJsonFile(path);
  return isRecord(parsed) ? parsed : undefined;
}

async function readMcpServers(path: string): Promise<Record<string, unknown>> {
  const parsed = await readJsonFile(path);
  const servers = isRecord(parsed) ? parsed.mcpServers : undefined;
  return isRecord(servers) ? servers : {};
}

/** Lists a file itself, or every file at any depth below a directory. */
async function componentFiles(path: string): Promise<string[]> {
  if (await isRegularFile(path)) return [path];

  const files: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function visit(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const entry of await readDirFollowingLinks(dir)) {
      const entryPath = join(dir, entry.name);
      if (entry.kind === 'dir') await visit(entryPath);
      else files.push(entryPath);
    }
  }

  await visit(path);
  return files.sort((a, b) => a.localeCompare(b));
}

// Returns undefined for a missing, unreadable, or invalid file: Cursor cannot load it either.
async function readJsonFile(path: string): Promise<unknown> {
  if (!(await isRegularFile(path))) return undefined;

  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function realPathOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

function isBelow(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

// Same id scheme as the other Cursor entries: a stable hash of the agent id and the path.
function makeId(input: string): string {
  return createHash('sha256').update(`${AGENT_ID}:${input}`).digest('hex').slice(0, 16);
}

type MarkdownComponent = { format: Skill['format']; extensions: string[] };

type LocalPlugin = {
  root: string;
  // The manifest name, or the folder name when the manifest has none.
  name: string;
  metadata: NonNullable<Skill['metadata']>;
};

type Manifest = Record<string, unknown>;
