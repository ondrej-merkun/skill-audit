import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Skill } from '../types.js';

const MAX_MANIFEST_FILES = 40;
const MAX_MANIFEST_DEPTH = 4;
const SKIPPED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'coverage',
  'node_modules',
  '__pycache__',
]);

export type DependencyRef = {
  ecosystem: 'npm' | 'pypi';
  name: string;
};

type PackageJson = {
  repository?: string | { url?: string };
  homepage?: string;
  bugs?: string | { url?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function stripGitHubSlugSuffix(repo: string): string {
  return repo.replace(/\.git$/i, '').replace(/\/$/, '');
}

export function extractGitHubSlugFromUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const scpLike = /^git@github\.com:([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[#?].*)?$/i.exec(trimmed);
  if (scpLike?.[1] && scpLike[2]) {
    return `${scpLike[1]}/${stripGitHubSlugSuffix(scpLike[2])}`;
  }

  const match =
    /(?:git\+)?(?:https?:\/\/|ssh:\/\/git@)github\.com[/:]([^/\s#?]+)\/([^/\s#?]+)(?:[/?#][^\s]*)?/i.exec(
      trimmed
    );
  if (!match?.[1] || !match[2]) return null;

  const owner = match[1];
  const repo = stripGitHubSlugSuffix(match[2]);
  if (owner.toLowerCase() === 'github' || repo.length === 0) return null;
  return `${owner}/${repo}`;
}

function packageJsonRepoCandidates(pkg: PackageJson): string[] {
  const candidates: string[] = [];
  if (typeof pkg.repository === 'string') candidates.push(pkg.repository);
  if (typeof pkg.repository === 'object' && typeof pkg.repository.url === 'string') {
    candidates.push(pkg.repository.url);
  }
  if (typeof pkg.homepage === 'string') candidates.push(pkg.homepage);
  if (typeof pkg.bugs === 'string') candidates.push(pkg.bugs);
  if (typeof pkg.bugs === 'object' && typeof pkg.bugs.url === 'string')
    candidates.push(pkg.bugs.url);
  return candidates;
}

async function skillRoot(skill: Skill): Promise<string> {
  try {
    const pathStat = await stat(skill.path);
    if (pathStat.isDirectory()) return skill.path;
  } catch {
    // Fall back to manifestPath below.
  }
  return skill.manifestPath === null ? dirname(skill.path) : dirname(skill.manifestPath);
}

async function findManifestFiles(root: string, fileName: string): Promise<string[]> {
  const files: string[] = [];
  const pending: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];

  while (pending.length > 0 && files.length < MAX_MANIFEST_FILES) {
    const current = pending.shift();
    if (current === undefined) break;

    let entries: Dirent[];
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = join(current.path, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        files.push(entryPath);
        if (files.length >= MAX_MANIFEST_FILES) break;
      } else if (
        entry.isDirectory() &&
        current.depth < MAX_MANIFEST_DEPTH &&
        !SKIPPED_DIRS.has(entry.name)
      ) {
        pending.push({ path: entryPath, depth: current.depth + 1 });
      }
    }
  }

  return files;
}

async function readPackageJson(path: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

export async function resolveGitHubSlug(skill: Skill): Promise<string | null> {
  const root = await skillRoot(skill);
  const packageJsonPaths = await findManifestFiles(root, 'package.json');

  for (const packageJsonPath of packageJsonPaths) {
    const pkg = await readPackageJson(packageJsonPath);
    if (pkg === null) continue;
    for (const candidate of packageJsonRepoCandidates(pkg)) {
      const slug = extractGitHubSlugFromUrl(candidate);
      if (slug !== null) return slug;
    }
  }

  if (packageJsonPaths.length > 0) return null;

  const skillMdPath = skill.manifestPath ?? join(root, 'SKILL.md');
  try {
    const text = await readFile(skillMdPath, 'utf8');
    for (const match of text.matchAll(/github\.com[/:][^\s)>"']+/gi)) {
      const slug = extractGitHubSlugFromUrl(`https://${match[0]}`);
      if (slug !== null) return slug;
    }
  } catch {
    // no SKILL.md or unreadable
  }

  return null;
}

function addPackageJsonDependencies(pkg: PackageJson, deps: DependencyRef[]): void {
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
  for (const name of names) deps.push({ ecosystem: 'npm', name });
}

function parseRequirements(raw: string): DependencyRef[] {
  const deps: DependencyRef[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = trimmed.split(/[>=<!~;\[]/)[0]?.trim();
    if (name) deps.push({ ecosystem: 'pypi', name });
  }
  return deps;
}

export async function readDependencyRefs(skill: Skill, maxDeps = 20): Promise<DependencyRef[]> {
  const root = await skillRoot(skill);
  const deps: DependencyRef[] = [];

  for (const packageJsonPath of await findManifestFiles(root, 'package.json')) {
    const pkg = await readPackageJson(packageJsonPath);
    if (pkg !== null) addPackageJsonDependencies(pkg, deps);
    if (deps.length >= maxDeps) return deps.slice(0, maxDeps);
  }

  for (const requirementsPath of await findManifestFiles(root, 'requirements.txt')) {
    try {
      deps.push(...parseRequirements(await readFile(requirementsPath, 'utf8')));
    } catch {
      // unreadable requirements file
    }
    if (deps.length >= maxDeps) return deps.slice(0, maxDeps);
  }

  return deps.slice(0, maxDeps);
}
