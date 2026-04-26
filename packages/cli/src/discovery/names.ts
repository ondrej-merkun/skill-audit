import { basename, dirname } from 'node:path';

const VERSION_LIKE_DIRECTORY = /^v?\d+\.\d+\.\d+(?:[-+].*)?$/;

export function isVersionLikeDirectoryName(name: string): boolean {
  return VERSION_LIKE_DIRECTORY.test(name);
}

export function fallbackSkillNameFromDirectory(dirPath: string): string {
  const leafName = basename(dirPath);
  if (!isVersionLikeDirectoryName(leafName)) return leafName;

  const parentName = basename(dirname(dirPath));
  return parentName === '' ? leafName : parentName;
}
