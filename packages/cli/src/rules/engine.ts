import { type Dirent, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { enterDirOnceSync, entryKindSync } from '../fs-walk.js';
import type { Finding, Rule, Severity, Skill } from '../types.js';
import {
  AGENT_CONFIG_COMMANDS_SCAN_NAME,
  AGENT_CONFIG_FILENAMES,
  extractAgentConfigCommands,
  extractAgentConfigCommandsOnOneLine,
} from './agent-config.js';
import { pathLooksDocumentationOnly } from './code-context.js';
import { shebangScanName } from './script-scan-name.js';

/** Node's read error for a file longer than the V8 string limit (536,870,888 chars). */
const STRING_TOO_LONG_ERROR_CODE = 'ERR_STRING_TOO_LONG';

type RawMatch = { index: number; text: string };
type PrepareContent = NonNullable<Rule['prepareContent']>;
// One view of a file that a rule matches, and the severity of the findings in it.
type SeverityView = { severity: Severity; prepareContent: PrepareContent | undefined };
type RunRulesOptions = {
  filenameOverride?: string;
  scanAllSupportingFiles?: boolean;
  /** Paths from collectScanTargetPaths; a directory walk does not enter them. */
  scanTargetPaths?: ReadonlySet<string>;
  scope?: Skill['scope'];
};

// One set of rules matched against one view of a file.
type MatchPass = {
  rules: Rule[];
  preparePath: string;
  // Rewrites the file content into the text this pass matches. Offsets must stay aligned.
  view?: (content: string) => string;
};

type ReachabilityIndex = {
  root: string;
  dirAliases: DirAlias[];
  referencedFiles: Set<string>;
  referencedDirs: Set<string>;
  allSupportingMarkdownReachable: boolean;
};

/** A second path (`dir`) to a real dir that the walk entered through another path. */
type DirAlias = { dir: string; realDir: string };

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
 * Returns empty array for patterns that fail the nested-quantifier preflight.
 * Content of any length is matched in full. A size cap or fixed windows would
 * let padding hide a finding or cut a long match in two.
 */
export function runPatternWithSafetyPreflight(
  pattern: RegExp,
  content: string
): Promise<RawMatch[]> {
  if (!isSafePattern(pattern)) return Promise.resolve([]);

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

function isSafePattern(pattern: RegExp): boolean {
  const cached = safePatternCache.get(pattern);
  if (cached !== undefined) return cached;
  const safe = !hasNestedQuantifier(pattern.source);
  safePatternCache.set(pattern, safe);
  return safe;
}

export function hasNestedQuantifier(source: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(source);
}

/**
 * Returns the offset where each line starts. Built once per file so that each
 * match maps to its line in O(log n), not in a full-content split per match.
 */
function lineStartOffsets(content: string): number[] {
  const starts = [0];
  let newline = content.indexOf('\n');
  while (newline !== -1) {
    starts.push(newline + 1);
    newline = content.indexOf('\n', newline + 1);
  }
  return starts;
}

/** Returns 1-based line and 1-based column for a character offset in content. */
function lineCol(lineStarts: number[], index: number): { line: number; column: number } {
  // Binary search for the last line that starts at or before index.
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= index) low = mid;
    else high = mid - 1;
  }

  return { line: low + 1, column: index - lineStarts[low] + 1 };
}

/** Extracts the source line with the given 1-based number, trimmed to 120 chars. */
function extractSnippet(content: string, lineStarts: number[], line: number): string {
  const lineStart = lineStarts[line - 1];
  const nextLineStart = lineStarts[line];
  const lineEnd = nextLineStart === undefined ? content.length : nextLineStart - 1;
  return content.slice(lineStart, lineEnd).trim().slice(0, 120);
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

const OPERATIVE_ENTRYPOINT_NAMES = new Set([
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

function buildReachabilityIndex(
  skillRoot: string,
  files: string[],
  dirAliases: DirAlias[]
): ReachabilityIndex | undefined {
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
    dirAliases,
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

/** Resolves each dir that the walk skipped as already entered to its real path. */
function resolveDirAliases(skippedDirs: string[]): DirAlias[] {
  return skippedDirs.flatMap((dir) => {
    try {
      return [{ dir, realDir: realpathSync(dir) }];
    } catch {
      return [];
    }
  });
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
    !isSupportingMarkdownPath(filePath, index) ||
    hasOperativeAliasPath(filePath, index)
  ) {
    return 'operative';
  }
  return 'inert-supporting-docs';
}

/**
 * True when a dir alias that the walk skipped gives the file a second path,
 * and that path is operative. The walk enters each real dir once, so with
 * `docs -> payload` or `payload -> docs` it lists the file under only one of
 * its two paths. A file is demoted only when every known path is inert docs.
 */
function hasOperativeAliasPath(filePath: string, index: ReachabilityIndex): boolean {
  return aliasPathsOf(filePath, index.dirAliases).some(
    (aliasPath) =>
      isReachableFromSkillMd(aliasPath, index) || !isSupportingMarkdownPath(aliasPath, index)
  );
}

/**
 * The path that rules prepare a file under. A docs-like path masks every line of
 * the file, so a file that a dir alias also reaches through a path that does not
 * look like docs is prepared under that path. Otherwise `docs -> scripts` would
 * hide a script that the agent runs.
 */
function preparePathFor(filePath: string, dirAliases: DirAlias[]): string {
  if (!pathLooksDocumentationOnly(filePath)) return filePath;

  const operativePath = aliasPathsOf(filePath, dirAliases).find(
    (aliasPath) => !pathLooksDocumentationOnly(aliasPath)
  );
  return operativePath ?? filePath;
}

/**
 * Rebuilds the other paths of a walked file through the dir aliases that the walk skipped.
 * ponytail: one alias level only; a path through two aliases is not rebuilt.
 */
function aliasPathsOf(filePath: string, dirAliases: DirAlias[]): string[] {
  if (dirAliases.length === 0) return [];

  let realFile: string;
  try {
    realFile = realpathSync(filePath);
  } catch {
    return [];
  }

  return dirAliases.flatMap((alias) => {
    const pathInAlias = relative(alias.realDir, realFile);
    if (pathInAlias.split(sep)[0] === '..' || isAbsolute(pathInAlias)) return [];
    return [join(alias.dir, pathInAlias)];
  });
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

/**
 * Recursively collects file paths under a scan target. A child file or directory that the
 * same scan reports as its own skill is skipped, so its findings are not counted twice.
 * Every other child belongs to this target, whatever marker files it contains.
 * Follows symlinks, so a skill cannot hide a script behind a link; each real
 * directory is walked once, so link loops end. A dir that is not walked because
 * the walk already entered its real path goes to `skippedDirs`.
 */
function walkDir(
  dir: string,
  scanTargetPaths: ReadonlySet<string>,
  skippedDirs: string[],
  visitedRealDirs = new Set<string>()
): string[] {
  if (!enterDirOnceSync(visitedRealDirs, dir)) {
    skippedDirs.push(dir);
    return [];
  }

  // An unreadable subtree (for example a link to a root-owned dir) is skipped
  // alone, so it cannot erase the findings of the rest of the skill.
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (scanTargetPaths.has(resolve(full))) continue;

    const kind = entryKindSync(dir, entry);
    if (kind === 'dir') {
      results.push(...walkDir(full, scanTargetPaths, skippedDirs, visitedRealDirs));
    } else if (kind === 'file') {
      results.push(full);
    }
  }
  return results;
}

/**
 * Reads a file for scanning. Returns undefined for a file that cannot be read.
 * Throws for a file above the V8 string limit: that file is unscanned, not
 * clean, so the skill scan must fail and report incomplete instead of PASS.
 */
function readScanContent(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    const isTooLong =
      error instanceof Error && 'code' in error && error.code === STRING_TOO_LONG_ERROR_CODE;
    if (isTooLong) throw new Error(`${filePath} is too large to scan`);
    return undefined;
  }
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
  const skippedDirs: string[] = [];
  try {
    const st = statSync(skillPath);
    isDirectory = st.isDirectory();
    // A FIFO, socket, or device target is skipped like a missing file: its read may never end.
    if (!isDirectory && !st.isFile()) return [];
    files = isDirectory
      ? walkDir(skillPath, options.scanTargetPaths ?? new Set(), skippedDirs)
      : [skillPath];
  } catch {
    return [];
  }
  const dirAliases = resolveDirAliases(skippedDirs);
  const reachability = isDirectory
    ? buildReachabilityIndex(skillPath, files, dirAliases)
    : undefined;

  for (const filePath of files) {
    const scanPath = preparePathFor(filePath, dirAliases);
    const { name, passes } = scanNameAndPasses(filePath, scanPath, rules, options);
    if (passes.length === 0) continue;

    const fileRole = classifySupportingFileRole(filePath, name, reachability, options);
    const content = readScanContent(filePath);
    if (content === undefined) continue;

    const fileFindings = await matchRules(filePath, content, passes);
    findings.push(...fileFindings.map((finding) => findingForRole(finding, fileRole)));
  }

  return findings;
}

export async function runRulesForSkill(
  skill: Skill,
  rules: Rule[],
  options: Pick<RunRulesOptions, 'scanAllSupportingFiles' | 'scanTargetPaths'> = {}
): Promise<Finding[]> {
  const runOptions: RunRulesOptions = {
    scope: skill.scope,
    ...(skill.metadata?.ruleScanFilename !== undefined
      ? { filenameOverride: skill.metadata.ruleScanFilename }
      : {}),
    ...options,
  };

  // Scope-limited rules judge agent config targets only. A settings.json inside a skill
  // directory is an example or fixture that no agent loads.
  const skillRules =
    skill.format === 'agent-config'
      ? rules
      : rules.filter((rule) => rule.appliesToScopes === undefined);

  const scanContent = skill.metadata?.ruleScanContent;
  if (scanContent !== undefined) {
    return runRulesOnContent(skill.path, scanContent, skillRules, runOptions);
  }

  return runRules(skill.path, skillRules, runOptions);
}

/** Scans text that discovery extracted for a skill, such as one MCP server's definition. */
async function runRulesOnContent(
  filePath: string,
  content: string,
  rules: Rule[],
  options: RunRulesOptions
): Promise<Finding[]> {
  const name = options.filenameOverride ?? basename(filePath);
  const preparePath = join(dirname(filePath), name);
  return matchRules(filePath, content, matchPasses(rules, name, preparePath, options.scope));
}

/**
 * Picks the name that selects the rules for a file, and the passes for that name. A scan
 * name from discovery wins. A file without an extension whose own name selects no rule, such
 * as `scripts/setup`, is scanned under the name of its shebang interpreter. A name that
 * selects rules keeps them, so a `#!` line cannot hide a Pipfile or a `.cursorrules` file.
 */
function scanNameAndPasses(
  filePath: string,
  scanPath: string,
  rules: Rule[],
  options: RunRulesOptions
): { name: string; passes: MatchPass[] } {
  const override = options.filenameOverride;
  const name = override ?? basename(filePath);
  const preparePath = override === undefined ? scanPath : join(dirname(scanPath), override);
  const passes = matchPasses(rules, name, preparePath, options.scope);
  if (passes.length > 0 || override !== undefined) return { name, passes };

  const shebangName = shebangScanName(filePath);
  if (shebangName === undefined) return { name, passes };

  // The shebang name also prepares the content, so shell comment masking applies.
  const shebangPreparePath = join(dirname(scanPath), shebangName);
  return {
    name: shebangName,
    passes: matchPasses(rules, shebangName, shebangPreparePath, options.scope),
  };
}

/**
 * Every file gets one pass with the rules for its name. Agent config files get a
 * second pass: their decoded command values run through the shell-script rules,
 * because agents run hook and MCP server commands in a shell.
 */
function matchPasses(
  rules: Rule[],
  name: string,
  preparePath: string,
  scope: Skill['scope'] | undefined
): MatchPass[] {
  const passes: MatchPass[] = [{ rules: rulesForScanName(rules, name, scope), preparePath }];

  if (AGENT_CONFIG_FILENAMES.has(name)) {
    const commandRules = rulesForScanName(rules, AGENT_CONFIG_COMMANDS_SCAN_NAME, scope);
    const commandsPath = join(dirname(preparePath), AGENT_CONFIG_COMMANDS_SCAN_NAME);
    // Two layouts of the same commands: the shell's lines, so a `#` comment line hides only
    // itself, and one line per command, so a pattern can span a pipeline or quoted body that
    // the shell continues across lines. A finding needs only one layout.
    passes.push(
      {
        rules: commandRules,
        preparePath: commandsPath,
        view: (content) => extractAgentConfigCommands(content, preparePath),
      },
      {
        rules: commandRules,
        preparePath: commandsPath,
        view: (content) => extractAgentConfigCommandsOnOneLine(content, preparePath),
      }
    );
  }

  return passes.filter((pass) => pass.rules.length > 0);
}

// An unknown scope (a direct runRules call) keeps scope-limited rules active.
function rulesForScanName(
  rules: Rule[],
  scanName: string,
  scope: Skill['scope'] | undefined
): Rule[] {
  return rules.filter(
    (rule) =>
      rule.appliesTo.some((glob) => matchesGlob(scanName, glob)) &&
      (scope === undefined ||
        rule.appliesToScopes === undefined ||
        rule.appliesToScopes.includes(scope))
  );
}

/** Reports each match at its line and column in the original content. */
async function matchRules(
  filePath: string,
  content: string,
  passes: MatchPass[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const lineStarts = lineStartOffsets(content);
  // One finding per rule per line, also when two passes match the same line.
  const seenLinesByRule = new Map<string, Set<number>>();

  for (const pass of passes) {
    const passContent = pass.view === undefined ? content : pass.view(content);
    const preparedContent = new Map<PrepareContent, string>();

    for (const rule of pass.rules) {
      const seenLines = seenLinesByRule.get(rule.id) ?? new Set<number>();
      seenLinesByRule.set(rule.id, seenLines);

      for (const view of severityViews(rule)) {
        const matchContent = prepareView(view, passContent, pass.preparePath, preparedContent);

        for (const pattern of rule.patterns) {
          const matches = await runPatternWithSafetyPreflight(pattern, matchContent);
          for (const { index, text } of matches) {
            const { line, column } = lineCol(lineStarts, index);
            if (seenLines.has(line)) continue;
            seenLines.add(line);

            findings.push({
              ruleId: rule.id,
              severity: view.severity,
              category: rule.category,
              file: filePath,
              line,
              column,
              snippet: extractSnippet(content, lineStarts, line) || text.trim().slice(0, 120),
              message: rule.message,
              fix: rule.fix,
              cwe: rule.cwe,
            });
          }
        }
      }
    }
  }

  return findings;
}

/**
 * The views that a rule's patterns match, each with the severity that its matches report.
 * The escalation view goes first, so a line that it matches keeps the higher severity.
 */
function severityViews(rule: Rule): SeverityView[] {
  const baseView = { severity: rule.severity, prepareContent: rule.prepareContent };
  return rule.escalation === undefined ? [baseView] : [rule.escalation, baseView];
}

function prepareView(
  view: SeverityView,
  content: string,
  preparePath: string,
  cache: Map<PrepareContent, string>
): string {
  if (view.prepareContent === undefined) return content;

  const cached = cache.get(view.prepareContent);
  if (cached !== undefined) return cached;

  const prepared = view.prepareContent(content, preparePath);
  cache.set(view.prepareContent, prepared);
  return prepared;
}

/**
 * Returns the normalized paths that discovered skills occupy: each scan path plus the
 * identical copies that discovery deduped into it, because the scan of the kept path
 * already covers their content.
 */
export function collectScanTargetPaths(skills: readonly Skill[]): ReadonlySet<string> {
  const paths = skills.flatMap((skill) => [skill.path, ...(skill.alsoInstalledAt ?? [])]);
  return new Set(paths.map((path) => resolve(path)));
}
