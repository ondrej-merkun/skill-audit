import type { Skill } from '../types.js';
import { installStateLabel } from './install-state.js';

const MCP_FORMATS = new Set<Skill['format']>(['mcp-server', 'mcp-toml', 'mcp-json']);
const PLUGIN_PAYLOAD_DIRS = new Set(['agents', 'commands', 'skills']);

function pathSegments(pathLike: string): string[] {
  return pathLike
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0);
}

function isPluginPath(skill: Skill): boolean {
  const segments = pathSegments(skill.path);
  return (
    skill.format === 'plugin.json' ||
    segments.some(
      (segment, index) =>
        (segment === '.claude' || segment === '.codex') && segments[index + 1] === 'plugins'
    ) ||
    segments.includes('.claude-plugin') ||
    segments.includes('.codex-plugin')
  );
}

function pluginNameFromPath(skill: Skill): string | null {
  const sourcePluginName = skill.metadata?.sourcePluginName;
  if (typeof sourcePluginName === 'string' && sourcePluginName.trim().length > 0) {
    return sourcePluginName.trim();
  }

  if (skill.format === 'plugin.json') return skill.name;

  const segments = pathSegments(skill.path);
  const pluginsIndex = segments.findIndex(
    (segment, index) =>
      (segments[index - 1] === '.claude' || segments[index - 1] === '.codex') &&
      segment === 'plugins'
  );
  if (pluginsIndex < 0) return null;

  if (segments[pluginsIndex + 1] === 'cache') {
    return segments[pluginsIndex + 3] ?? null;
  }

  const payloadIndex = segments.findIndex(
    (segment, index) => index > pluginsIndex && PLUGIN_PAYLOAD_DIRS.has(segment)
  );
  if (payloadIndex > pluginsIndex + 1) return segments[payloadIndex - 1] ?? null;

  return segments.at(-1) ?? null;
}

function pluginLabel(skill: Skill): string {
  const name = pluginNameFromPath(skill);
  return name === null ? 'Plugin' : `Plugin - ${name}`;
}

export function skillSourceLabel(skill: Skill): string {
  if (installStateLabel(skill.installState) === 'marketplace') return 'Marketplace';
  if (MCP_FORMATS.has(skill.format)) return 'MCP';
  if (skill.format === 'gemini-extension-json') return 'Extension';
  if (isPluginPath(skill)) return pluginLabel(skill);
  return 'Direct';
}
