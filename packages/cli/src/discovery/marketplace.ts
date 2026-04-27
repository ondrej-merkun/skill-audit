import type { Skill } from '../types.js';

function normalizedSegments(pathLike: string): string[] {
  return pathLike
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0);
}

export function isPluginMarketplacePath(pathLike: string): boolean {
  const segments = normalizedSegments(pathLike);

  return segments.some(
    (segment, index) => segment === 'plugins' && segments[index + 1] === 'marketplaces'
  );
}

export function shouldSkipMarketplacePath(pathLike: string, includeMarketplaces = false): boolean {
  return !includeMarketplaces && isPluginMarketplacePath(pathLike);
}

export function withInstallState(skill: Skill): Skill {
  return {
    ...skill,
    installState:
      skill.installState ?? (isPluginMarketplacePath(skill.path) ? 'marketplace' : 'installed'),
  };
}
