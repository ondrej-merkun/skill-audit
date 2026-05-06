import { type Dirent, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import type { Finding, Rule, Skill } from '../types.js';

const MAX_SCANNED_CONTENT_CHARS = 1_000_000;

type RawMatch = { index: number; text: string };
type PrepareContent = NonNullable<Rule['prepareContent']>;
type RunRulesOptions = {
  filenameOverride?: string;
  scanAllSupportingFiles?: boolean;
};

type ReachabilityIndex = {
  root: string;
  referencedFiles: Set<string>;
  referencedDirs: Set<string>;
  allSupportingMarkdownReachable: boolean;
};

type SupportingFileRole = 'operative' | 'inert-supporting-docs';

const safePatternCache = new WeakMap<RegExp, boolean>();
const globalPatternCache = new Map<string, RegExp>();

function globalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const key = `${flags}\0${pattern.source}`;
  const cached = globalPatternCache.get(key);
  if (cached !== undefined) {
    cached.lastIndex = 0;
    return cached;
  }
  const compiled = new RegExp(pattern.source, flags);
  globalPatternCache.set(key, compiled);
  return compiled;
}

/**
 * Runs a single regex pattern against content without spawning workers.
 * Returns empty array for inputs that fail the pre-flight safety caps.
 */
export function runPatternWithSafetyPreflight(
  pattern: RegExp,
  content: string
): Promise<RawMatch[]> {
  if (!isSafeRegexInput(pattern, content)) return Promise.resolve([]);

  const re = globalPattern(pattern);
  const matches: RawMatch[] = [];

  try {
    for (const match of content.matchAll(re)) {
      const matchIndex = match.index ?? 0;
      const findingText = match.groups?.finding;
      const findingOffset =
        findingText && findingText.length > 0 ? match[0].indexOf(findingText) : -1;

      matches.push({
        index: findingOffset >= 0 ? matchIndex + findingOffset : matchIndex,
        text: findingText ?? match[0],
      });
    }
  } catch {
    return Promise.resolve([]);
  }

  return Promise.resolve(matches);
}

function isSafeRegexInput(pattern: RegExp, content: string): boolean {
  if (content.length > MAX_SCANNED_CONTENT_CHARS) return false;
  const cached = safePatternCache.get(pattern);
  if (cached !== undefined) return cached;
  const safe = !hasNestedQuantifier(pattern.source);
  safePatternCache.set(pattern, safe);
  return safe;
}

function hasNestedQuantifier(source: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(source);
}

/** Returns 1-based line and 1-based column for a byte offset in content. */
function lineCol(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

/** Extracts the source line containing the match, trimmed to 120 chars. */
function extractSnippet(content: string, index: number): string {
  const { line } = lineCol(content, index);
  return (content.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

/**
 * Matches a filename against a glob pattern.
 * Supported forms: literal ("SKILL.md"), prefix-wildcard ("*.md"),
 * suffix-wildcard ("README*"), and one interior wildcard (".env*").
 */
export function matchesGlob(filename: string, glob: string): boolean {
  if (!glob.includes('*')) return filename === glob;
  const starIdx = glob.indexOf('*');
  const prefix = glob.slice(0, starIdx);
  const suffix = glob.slice(glob.lastIndexOf('*') + 1);
  return filename.startsWith(prefix) && filename.endsWith(suffix);
}

const NESTED_SCAN_ROOT_MARKERS = new Set([
  'SKILL.md',
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  'GEMINI.md',
  'CONVENTIONS.md',
  '.cursorrules',
  '.windsurfrules',
  'plugin.json',
  'gemini-extension.json',
]);

const OPERATIVE_ENTRYPOINT_NAMES = new Set([
  ...NESTED_SCAN_ROOT_MARKERS,
  'README.md',
  'COMMAND.md',
  'config.toml',
  'settings.json',
  '.mcp.json',
  'mcp.json',
]);

const SUPPORTING_MARKDOWN_DIRS = new Set([
  'doc',
  'docs',
  'documentation',
  'example',
  'examples',
  'fixture',
  'fixtures',
  'reference',
  'references',
  'test',
  'tests',
]);

function isPromptBearingCommandOrAgentDir(dirName: string, entries: Dirent[]) {
  if (dirName !== 'commands' && dirName !== 'agents') return false;
  return entries.some(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith('.md') || entry.name.endsWith('.mdc') || entry.name.endsWith('.toml'))
  );
}

function isNestedScanRoot(dir: string): boolean {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  if (entries.some((entry) => entry.isFile() && NESTED_SCAN_ROOT_MARKERS.has(entry.name))) {
    return true;
  }

  return isPromptBearingCommandOrAgentDir(basename(dir), entries);
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}

function normalizeReferencedPath(rawPath: string): string | undefined {
  let candidate = rawPath.trim();
  if (candidate === '') return undefined;
  candidate = candidate.replace(/^<|>$/g, '');
  candidate = candidate.replace(/[),.;:]+$/g, '');
  candidate = candidate.split('#')[0] ?? '';
  candidate = candidate.split('?')[0] ?? '';
  candidate = candidate.replace(/^\.\//, '');
  if (
    candidate === '' ||
    candidate.startsWith('/') ||
    candidate.startsWith('../') ||
    candidate.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(candidate)
  ) {
    return undefined;
  }
  return candidate.replaceAll('\\', '/');
}

function addReachablePath(index: ReachabilityIndex, rawPath: string): void {
  const ref = normalizeReferencedPath(rawPath);
  if (ref === undefined) return;

  const globIndex = ref.search(/[*?[{]/);
  if (globIndex >= 0) {
    const prefix = ref.slice(0, globIndex);
    const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
    if (dir !== '') index.referencedDirs.add(dir);
    return;
  }

  if (ref.endsWith('/')) {
    index.referencedDirs.add(ref);
    return;
  }

  if (extname(ref) === '') {
    index.referencedDirs.add(`${ref}/`);
    return;
  }

  index.referencedFiles.add(ref);
}

function buildReachabilityIndex(skillRoot: string, files: string[]): ReachabilityIndex | undefined {
  const skillMdPath = join(skillRoot, 'SKILL.md');
  if (!files.includes(skillMdPath)) return undefined;

  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf-8');
  } catch {
    return undefined;
  }

  const index: ReachabilityIndex = {
    root: skillRoot,
    referencedFiles: new Set(),
    referencedDirs: new Set(),
    allSupportingMarkdownReachable:
      /\b(?:nearby files|bundled resources|all supporting (?:files|docs|documents)|all docs)\b/i.test(
        content
      ),
  };

  for (const match of content.matchAll(/\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    if (match[1] !== undefined) addReachablePath(index, match[1]);
  }

  for (const match of content.matchAll(
    /(?:^|[\s`"'(])((?:\.\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.{}*?[\]-]+)+(?:\/)?|(?:\.\/)?[A-Za-z0-9_.-]+\.(?:md|mdc|txt|json|toml|ya?ml|js|ts|mjs|cjs|py|sh|bash))(?:[\s`"',).;:]|$)/g
  )) {
    if (match[1] !== undefined) addReachablePath(index, match[1]);
  }

  for (const match of content.matchAll(
    /\b(?:in|under|from|inside|within)\s+(?:the\s+)?(docs?|documentation|examples?|references?)\b/gi
  )) {
    if (match[1] !== undefined) addReachablePath(index, `${match[1]}/`);
  }

  return index;
}

function isMarkdownPromptFile(scanName: string): boolean {
  return scanName.endsWith('.md') || scanName.endsWith('.mdc');
}

function isSupportingMarkdownPath(filePath: string, index: ReachabilityIndex): boolean {
  const rel = normalizeRelativePath(relative(index.root, filePath));
  const segments = rel.split('/');
  return segments.some((segment) => SUPPORTING_MARKDOWN_DIRS.has(segment.toLowerCase()));
}

function isReachableFromSkillMd(filePath: string, index: ReachabilityIndex): boolean {
  const rel = normalizeRelativePath(relative(index.root, filePath));
  if (index.referencedFiles.has(rel)) return true;
  for (const dir of index.referencedDirs) {
    if (rel.startsWith(dir)) return true;
  }
  return false;
}

function classifySupportingFileRole(
  filePath: string,
  scanName: string,
  index: ReachabilityIndex | undefined,
  options: Pick<RunRulesOptions, 'scanAllSupportingFiles'>
): SupportingFileRole {
  if (
    options.scanAllSupportingFiles === true ||
    index === undefined ||
    !isMarkdownPromptFile(scanName) ||
    OPERATIVE_ENTRYPOINT_NAMES.has(basename(filePath)) ||
    index.allSupportingMarkdownReachable ||
    isReachableFromSkillMd(filePath, index) ||
    !isSupportingMarkdownPath(filePath, index)
  ) {
    return 'operative';
  }
  return 'inert-supporting-docs';
}

function findingForRole(finding: Finding, role: SupportingFileRole): Finding {
  if (role !== 'inert-supporting-docs') return finding;
  return {
    ...finding,
    severity: 'info',
    message: `Inert supporting docs: ${finding.message}`,
    ignoredForVerdict: true,
    fileRole: role,
  };
}

/** Recursively collects file paths under a scan target without entering child scan roots. */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isNestedScanRoot(full)) continue;
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Runs all applicable rules against every file in skillPath.
 * skillPath may be a directory or a single file.
 * Returns findings (one per rule per line — same rule firing on the same line = one finding).
 */
export async function runRules(
  skillPath: string,
  rules: Rule[],
  options: RunRulesOptions = {}
): Promise<Finding[]> {
  const findings: Finding[] = [];

  let files: string[];
  let isDirectory: boolean;
  try {
    const st = statSync(skillPath);
    isDirectory = st.isDirectory();
    files = isDirectory ? walkDir(skillPath) : [skillPath];
  } catch {
    return [];
  }
  const reachability = isDirectory ? buildReachabilityIndex(skillPath, files) : undefined;

  for (const filePath of files) {
    const name = options.filenameOverride ?? basename(filePath);
    const fileRole = classifySupportingFileRole(filePath, name, reachability, options);
    const preparePath =
      options.filenameOverride === undefined ? filePath : join(dirname(filePath), name);
    const applicableRules = rules.filter((rule) =>
      rule.appliesTo.some((glob) => matchesGlob(name, glob))
    );
    if (applicableRules.length === 0) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const preparedContent = new Map<PrepareContent, string>();
    for (const rule of applicableRules) {
      // Track seen lines per rule to avoid duplicate findings from overlapping patterns
      const seenLines = new Set<number>();

      let matchContent = content;
      if (rule.prepareContent !== undefined) {
        const cached = preparedContent.get(rule.prepareContent);
        if (cached === undefined) {
          matchContent = rule.prepareContent(content, preparePath);
          preparedContent.set(rule.prepareContent, matchContent);
        } else {
          matchContent = cached;
        }
      }
      for (const pattern of rule.patterns) {
        const matches = await runPatternWithSafetyPreflight(pattern, matchContent);
        for (const { index, text } of matches) {
          const { line, column } = lineCol(content, index);
          if (seenLines.has(line)) continue;
          seenLines.add(line);

          const finding: Finding = {
            ruleId: rule.id,
            severity: rule.severity,
            category: rule.category,
            file: filePath,
            line,
            column,
            snippet: extractSnippet(content, index) || text.trim().slice(0, 120),
            message: rule.message,
            fix: rule.fix,
            cwe: rule.cwe,
          };
          findings.push(findingForRole(finding, fileRole));
        }
      }
    }
  }

  return findings;
}

export async function runRulesForSkill(
  skill: Skill,
  rules: Rule[],
  options: Pick<RunRulesOptions, 'scanAllSupportingFiles'> = {}
): Promise<Finding[]> {
  return runRules(skill.path, rules, {
    ...(skill.metadata?.ruleScanFilename !== undefined
      ? { filenameOverride: skill.metadata.ruleScanFilename }
      : {}),
    ...(options.scanAllSupportingFiles !== undefined
      ? { scanAllSupportingFiles: options.scanAllSupportingFiles }
      : {}),
  });
}
