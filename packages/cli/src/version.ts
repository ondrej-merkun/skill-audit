import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

declare const __PACKAGE_VERSION__: string | undefined;

function readPackageVersion(): string {
  const candidates = [
    join(process.cwd(), 'packages/cli/package.json'),
    join(process.cwd(), 'package.json'),
  ];
  const packageJsonPath = candidates.find((candidate) => existsSync(candidate));
  if (packageJsonPath === undefined) throw new Error('package.json version is missing');

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown };

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error('package.json version is missing');
  }

  return packageJson.version;
}

export const VERSION =
  typeof __PACKAGE_VERSION__ === 'string' && __PACKAGE_VERSION__.length > 0
    ? __PACKAGE_VERSION__
    : readPackageVersion();
export const USER_AGENT = `skill-audit/${VERSION} (+github.com/ondrej-merkun/skill-audit)`;
