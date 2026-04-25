import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Finding, Rule } from '../types.js';

const REGEX_TIMEOUT_MS = 500;
const MAX_SCANNED_CONTENT_CHARS = 1_000_000;

type RawMatch = { index: number; text: string };

/**
 * Runs a single regex pattern against content without spawning workers.
 * Returns empty array for inputs that fail the pre-flight safety caps.
 */
export function runPatternWithTimeout(
  pattern: RegExp,
  content: string,
  timeoutMs = REGEX_TIMEOUT_MS
): Promise<RawMatch[]> {
  void timeoutMs;
  if (!isSafeRegexInput(pattern, content)) return Promise.resolve([]);

  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const matches: RawMatch[] = [];

  try {
    for (const match of content.matchAll(re)) {
      matches.push({ index: match.index ?? 0, text: match[0] });
    }
  } catch {
    return Promise.resolve([]);
  }

  return Promise.resolve(matches);
}

function isSafeRegexInput(pattern: RegExp, content: string): boolean {
  if (content.length > MAX_SCANNED_CONTENT_CHARS) return false;
  return !hasNestedQuantifier(pattern.source);
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

/** Recursively collects all file paths under a directory. */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
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
export async function runRules(skillPath: string, rules: Rule[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  let files: string[];
  try {
    const st = statSync(skillPath);
    files = st.isDirectory() ? walkDir(skillPath) : [skillPath];
  } catch {
    return [];
  }

  for (const filePath of files) {
    const name = basename(filePath);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    for (const rule of rules) {
      if (!rule.appliesTo.some((glob) => matchesGlob(name, glob))) continue;

      // Track seen lines per rule to avoid duplicate findings from overlapping patterns
      const seenLines = new Set<number>();

      for (const pattern of rule.patterns) {
        const matches = await runPatternWithTimeout(pattern, content);
        for (const { index, text } of matches) {
          const { line, column } = lineCol(content, index);
          if (seenLines.has(line)) continue;
          seenLines.add(line);

          findings.push({
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
          });
        }
      }
    }
  }

  return findings;
}
