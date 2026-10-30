import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isRegularFile } from '../fs-walk.js';
import { isBelow } from './agent-config.js';

/**
 * Lists the plugin cache dirs that Claude Code loads: the install path of each record in
 * `installed_plugins.json` whose plugin is enabled. Claude Code never loads other cache dirs,
 * such as the previous version that it keeps for 14 days after an update.
 */
export async function activePluginInstallPaths(home: string, cwd: string): Promise<string[]> {
  const pluginsDir = join(home, '.claude', 'plugins');
  const cacheDir = join(pluginsDir, 'cache');
  const records = await readInstallRecords(join(pluginsDir, 'installed_plugins.json'));
  const enabledPluginsFor = createEnabledPluginsReader(home);

  const installPaths = new Set<string>();
  for (const record of records) {
    const installPath = resolve(record.installPath);
    // A record that points outside the cache is not walked, so it cannot widen the scan.
    if (!isBelow(cacheDir, installPath)) continue;

    // Managed settings installed a `managed` record and keep it on, whatever the user sets.
    const enabled =
      record.scope === 'managed' ||
      (await enabledPluginsFor(record.projectPath ?? cwd)).get(record.pluginId) !== false;
    if (enabled) installPaths.add(installPath);
  }

  return [...installPaths].sort((a, b) => a.localeCompare(b));
}

/** Reads the install records of format version 2: plugin id to a list of installs. */
async function readInstallRecords(recordsPath: string): Promise<InstallRecord[]> {
  const plugins = (await readJsonObject(recordsPath))?.['plugins'];
  if (!isRecord(plugins)) return [];

  const records: InstallRecord[] = [];
  for (const [pluginId, installs] of Object.entries(plugins)) {
    if (!Array.isArray(installs)) continue;

    for (const install of installs.filter(isRecord)) {
      if (typeof install['installPath'] !== 'string') continue;

      records.push({
        pluginId,
        scope: install['scope'],
        installPath: install['installPath'],
        // Only project and local installs have a projectPath: the project that they load in.
        projectPath:
          typeof install['projectPath'] === 'string' ? install['projectPath'] : undefined,
      });
    }
  }

  return records;
}

/**
 * Returns a reader of the merged `enabledPlugins` values for a project dir. The user, project,
 * and local settings files merge key by key, and a later file wins for each plugin id that it
 * names. Managed settings win over all three, but they come from sources that discovery does not
 * read (remote, MDM, registry, and system files), so a managed value on a non-managed record is
 * not seen.
 * ponytail: a plugin that no file names falls back to its manifest `defaultEnabled`, which a
 * marketplace entry can override. Discovery treats it as enabled, so it can over-report but
 * not hide a payload. Read the manifest and marketplace entry if that over-report matters.
 */
function createEnabledPluginsReader(home: string): (projectDir: string) => Promise<EnabledPlugins> {
  const mergedByProjectDir = new Map<string, Promise<EnabledPlugins>>();

  return (projectDir) => {
    let merged = mergedByProjectDir.get(projectDir);
    if (merged === undefined) {
      merged = mergeEnabledPlugins([
        join(home, '.claude', 'settings.json'),
        join(projectDir, '.claude', 'settings.json'),
        join(projectDir, '.claude', 'settings.local.json'),
      ]);
      mergedByProjectDir.set(projectDir, merged);
    }
    return merged;
  };
}

async function mergeEnabledPlugins(settingsPaths: string[]): Promise<EnabledPlugins> {
  const merged: EnabledPlugins = new Map();

  for (const settingsPath of settingsPaths) {
    const enabledPlugins = (await readJsonObject(settingsPath))?.['enabledPlugins'];
    if (!isRecord(enabledPlugins)) continue;

    for (const [pluginId, enabled] of Object.entries(enabledPlugins)) {
      if (typeof enabled === 'boolean') merged.set(pluginId, enabled);
    }
  }

  return merged;
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  if (!(await isRegularFile(path))) return undefined;

  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type InstallRecord = {
  pluginId: string;
  scope: unknown;
  installPath: string;
  projectPath: string | undefined;
};

/** Plugin id (`<plugin>@<marketplace>`) to its enabledPlugins value. */
type EnabledPlugins = Map<string, boolean>;
