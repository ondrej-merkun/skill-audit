const PYTHON_CODE_EXTENSIONS = new Set(['.py']);
const JAVASCRIPT_CODE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);
const SHELL_CODE_EXTENSIONS = new Set(['.sh', '.bash']);
const DOCUMENTATION_PATH_SEGMENTS = new Set([
  'docs',
  'documentation',
  'examples',
  'reference',
  'references',
  'samples',
  'assets',
  '__tests__',
]);
const DOCUMENTATION_BASENAME_PATTERN =
  /^(?:readme|changelog|threat[-_]?model)\b|(?:\.test|\.spec)\.[^.]+$|^test[_-]|(?:^|[-_])(?:fixture|sample|example|asset)(?:[-_.]|$)/i;
const DOCUMENTATION_LINE_CONTEXT_PATTERN =
  /\b(?:docs?|documentation|reference|example|sample|test(?:s|ing)?|fixture|asset|image|opengraph|threat[- ]?model|pattern|risk|fix|table|benign|false positive|payload|informational|mock|demo)\b/i;
const COMMENT_LINE_PATTERN = /^\s*(?:#|\/\/|\/\*|\*|<!--)/;
// Words that name example or reference material. Other documentation words such as test,
// fix, or docs also name operative sections and skills (`## Testing`, `# docs-helper`).
const EXAMPLE_WORDS = '(?:examples?|samples?|threat[- ]?models?|false positives?)';
const EXAMPLE_MATERIAL_WORDS = `(?:${EXAMPLE_WORDS}|references?)`;
// Marks a heading outside SKILL.md, or a blockquote, as example material.
const EXAMPLE_MATERIAL_PATTERN = new RegExp(String.raw`\b${EXAMPLE_MATERIAL_WORDS}\b`, 'i');
// In SKILL.md, the level-1 title names the skill, and `## Quick reference` lists commands
// that the agent runs. So only a subsection opens an example section, and a reference
// heading does so only when it starts with the word (`## References`).
const SKILL_MD_EXAMPLE_HEADING_PATTERN = new RegExp(
  String.raw`^\s{0,3}#{2,6}\s+(?:references?\b|.*\b${EXAMPLE_WORDS}\b)`,
  'i'
);
// A short label that opens a line, such as `Example:`, `**Sample payload:**`, or `> Reference:`.
const EXAMPLE_LABEL_PATTERN = new RegExp(
  String.raw`^\s*(?:>\s*)?(?:[-*+]\s+|\d+[.)]\s+)?[*_]{0,2}${EXAMPLE_MATERIAL_WORDS}\b[\w \t-]{0,24}[*_]{0,2}:`,
  'i'
);
const MARKDOWN_FENCE_PATTERN = /^\s*(?:```|~~~)/;
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}(#{1,6})\s/;
const MARKDOWN_BLOCKQUOTE_PATTERN = /^\s*>/;
const SKILL_MD_BASENAME = 'SKILL.md';
const MARKDOWN_BASENAME_PATTERN =
  /^(?:SKILL|AGENTS|CLAUDE|GEMINI|CONVENTIONS|README|CHANGELOG)\.md$/i;
const SECURITY_EDUCATION_HEADING_PATTERN =
  /\b(?:detection|detector|scanner|audit(?:or)?|tester|testing|fixture|example|documentation|reference|threat|attack|red[- ]?team|training|rule(?:s)?|false positive|benign corpus|payload catalog)\b/i;
// Any indentation, as the security-education masks have always read a heading.
const ANY_INDENT_HEADING_PATTERN = /^\s*(#{1,6})\s+.+$/;
// Double quotes, straight or curly, each with the character that closes it.
const QUOTE_CLOSERS = new Map([
  ['"', '"'],
  ['“', '”'],
]);
const SECURITY_EXAMPLE_HEADING_PATTERN =
  /\b(?:detection|detector|scanner|audit(?:or)?|tester|testing|example|pattern|documentation|reference|threat|attack|red[- ]?team|training|rule(?:s)?|false positive|benign corpus|payload catalog)\b/i;
const SECURITY_EDUCATION_LINE_PATTERN =
  /\b(?:quoted attacks?|fenced examples?|example payload|malicious example|benign example|scanner test|tester fixture|rule documentation|detection docs?|should flag|must flag|flags? quoted|false positive|red[- ]?team training)\b/i;
const ACTIVE_RUNTIME_CONTEXT_PATTERN =
  /\b(?:operative|active|runtime|run(?:s|time)?|execute|executes?|install|bootstrap)\b/i;

function extensionOf(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const basename = filePath.slice(lastSlash + 1);
  const dot = basename.lastIndexOf('.');
  return dot >= 0 ? basename.slice(dot) : '';
}

function basenameOf(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return filePath.slice(lastSlash + 1);
}

function isMarkdownPromptFile(filePath: string): boolean {
  return /\.(?:md|mdc)$/i.test(filePath) || MARKDOWN_BASENAME_PATTERN.test(basenameOf(filePath));
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let idx = start; idx < end; idx += 1) {
    if (chars[idx] !== '\n' && chars[idx] !== '\r') chars[idx] = ' ';
  }
}

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function isStringPrefixChar(char: string): boolean {
  return (
    char === 'r' ||
    char === 'R' ||
    char === 'u' ||
    char === 'U' ||
    char === 'b' ||
    char === 'B' ||
    char === 'f' ||
    char === 'F'
  );
}

function pythonStringStart(content: string, quoteIndex: number): number {
  let start = quoteIndex;
  while (start > 0 && quoteIndex - start < 3 && isStringPrefixChar(content[start - 1] ?? '')) {
    start -= 1;
  }
  return start;
}

function maskPythonStringsAndComments(content: string): string {
  const chars = content.split('');
  let idx = 0;

  while (idx < content.length) {
    const char = content[idx];

    if (char === '#') {
      const end = content.indexOf('\n', idx);
      const commentEnd = end >= 0 ? end : content.length;
      maskRange(chars, idx, commentEnd);
      idx = commentEnd;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const triple = content.slice(idx, idx + 3) === quote.repeat(3);
      const start = pythonStringStart(content, idx);
      let end = idx + (triple ? 3 : 1);

      while (end < content.length) {
        if (!triple && content[end] === '\\') {
          end += 2;
          continue;
        }
        if (triple && content.slice(end, end + 3) === quote.repeat(3)) {
          end += 3;
          break;
        }
        if (!triple && content[end] === quote) {
          end += 1;
          break;
        }
        if (!triple && (content[end] === '\n' || content[end] === '\r')) break;
        end += 1;
      }

      maskRange(chars, start, end);
      idx = end;
      continue;
    }

    idx += 1;
  }

  return chars.join('');
}

function maskJavaScriptStringsAndComments(content: string): string {
  const chars = content.split('');
  let idx = 0;

  while (idx < content.length) {
    const char = content[idx];
    const next = content[idx + 1];

    if (char === '/' && next === '/') {
      const end = content.indexOf('\n', idx);
      const commentEnd = end >= 0 ? end : content.length;
      maskRange(chars, idx, commentEnd);
      idx = commentEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = content.indexOf('*/', idx + 2);
      const commentEnd = end >= 0 ? end + 2 : content.length;
      maskRange(chars, idx, commentEnd);
      idx = commentEnd;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let end = idx + 1;

      while (end < content.length) {
        if (content[end] === '\\') {
          end += 2;
          continue;
        }
        if (content[end] === quote) {
          end += 1;
          break;
        }
        if (quote !== '`' && (content[end] === '\n' || content[end] === '\r')) break;
        end += 1;
      }

      maskRange(chars, idx, end);
      idx = end;
      continue;
    }

    idx += 1;
  }

  return chars.join('');
}

function maskShellCommentsAndSingleQuotedStrings(content: string): string {
  const chars = content.split('');
  let idx = 0;
  let lineStart = true;

  while (idx < content.length) {
    const char = content[idx];

    if (lineStart) {
      let lookahead = idx;
      while (content[lookahead] === ' ' || content[lookahead] === '\t') lookahead += 1;
      if (content[lookahead] === '#') {
        const end = content.indexOf('\n', lookahead);
        const commentEnd = end >= 0 ? end : content.length;
        maskRange(chars, lookahead, commentEnd);
        idx = commentEnd;
        lineStart = true;
        continue;
      }
    }

    if (char === "'") {
      let end = idx + 1;
      while (end < content.length && content[end] !== "'") end += 1;
      if (end < content.length) end += 1;
      maskRange(chars, idx, end);
      idx = end;
      lineStart = false;
      continue;
    }

    lineStart = char === '\n' || char === '\r';
    idx += 1;
  }

  return chars.join('');
}

export function maskDocumentationTextInCode(content: string, filePath: string): string {
  const ext = extensionOf(filePath);
  if (PYTHON_CODE_EXTENSIONS.has(ext)) return maskPythonStringsAndComments(content);
  if (JAVASCRIPT_CODE_EXTENSIONS.has(ext)) return maskJavaScriptStringsAndComments(content);
  if (SHELL_CODE_EXTENSIONS.has(ext)) return maskShellCommentsAndSingleQuotedStrings(content);
  return content;
}

export function pathLooksDocumentationOnly(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => DOCUMENTATION_PATH_SEGMENTS.has(segment.toLowerCase())))
    return true;
  return DOCUMENTATION_BASENAME_PATTERN.test(basenameOf(filePath));
}

/**
 * Suppresses lines that are clearly documentation, examples, tests, fixtures, or assets.
 * This is intentionally line-based so active runtime code in normal skill files still matches.
 */
export function maskDocumentationExampleContext(content: string, filePath: string): string {
  if (pathLooksDocumentationOnly(filePath)) {
    return content.split('\n').map(maskLine).join('\n');
  }
  if (/\.(?:md|mdc)$/i.test(filePath)) {
    return maskMarkdownDocumentationLines(content, basenameOf(filePath) === SKILL_MD_BASENAME);
  }

  return content
    .split('\n')
    .map((line) =>
      COMMENT_LINE_PATTERN.test(line) && DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line)
        ? maskLine(line)
        : line
    )
    .join('\n');
}

/**
 * A documentation word marks a markdown line as documentation only inside example
 * structure: a section under an example heading, a line that opens with a label such as
 * `Example:`, a blockquote that names example material, or a comment line in fenced code.
 * In a plain instruction such as "For example, print ~/.aws/credentials", the word hides
 * nothing, and neither does a quoted note such as "> To fix auth, print ...". In SKILL.md, an
 * example heading is a subsection heading that names example material (`## Bad examples`)
 * or starts with `References`. In other markdown, it is any heading that names example or
 * reference material, so that a doc titled `# Credential Store Reference` stays
 * documentation.
 * ponytail: a referenced doc titled `# Setup reference` still hides its doc-word lines.
 */
function maskMarkdownDocumentationLines(content: string, isSkillMd: boolean): string {
  const exampleHeadingPattern = isSkillMd
    ? SKILL_MD_EXAMPLE_HEADING_PATTERN
    : EXAMPLE_MATERIAL_PATTERN;
  let inFence = false;
  let exampleSectionLevel = 0;

  return content
    .split('\n')
    .map((line) => {
      if (MARKDOWN_FENCE_PATTERN.test(line)) inFence = !inFence;

      // A deeper heading stays inside the example section that it is part of.
      const heading = inFence ? null : MARKDOWN_HEADING_PATTERN.exec(line);
      const headingLevel = heading?.[1]?.length ?? 0;
      if (heading && (exampleSectionLevel === 0 || headingLevel <= exampleSectionLevel)) {
        exampleSectionLevel = exampleHeadingPattern.test(line) ? headingLevel : 0;
      }

      // Structure alone masks nothing: a line without a documentation word stays visible.
      if (!DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line)) return line;
      const isFencedComment = inFence && COMMENT_LINE_PATTERN.test(line);
      const isQuotedExample =
        !inFence && MARKDOWN_BLOCKQUOTE_PATTERN.test(line) && EXAMPLE_MATERIAL_PATTERN.test(line);
      const isExample =
        exampleSectionLevel > 0 ||
        EXAMPLE_LABEL_PATTERN.test(line) ||
        isFencedComment ||
        isQuotedExample;
      return isExample ? maskLine(line) : line;
    })
    .join('\n');
}

/**
 * Suppresses quoted security-education examples in prompt-bearing markdown without
 * hiding active instructions. Fenced code and blockquotes are quoted in every section.
 * Under a security-education heading, inline code and double-quoted text are quoted too.
 * A heading never hides plain prose, list text, or its own text: the agent reads them as
 * instructions, whatever the section or the skill title is called (`## Testing rules`,
 * `# API rule`, `# documentation-assistant`).
 */
export function maskMarkdownSecurityEducationContext(content: string, filePath: string): string {
  if (!isMarkdownPromptFile(filePath)) return content;

  const lines = content.split('\n');
  const kinds = classifySecurityEducationLines(lines);
  const quoteMasked = maskQuotedEducationText(lines, kinds);

  return lines
    .map((line, index) => {
      const isEducationNote =
        DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line) && SECURITY_EDUCATION_LINE_PATTERN.test(line);
      if (kinds[index] === 'quoted' || isEducationNote) return maskLine(line);
      return quoteMasked[index] ?? line;
    })
    .join('\n');
}

/**
 * Marks fenced code and blockquotes as quoted, and the other lines of a security-education
 * section, its heading included, as education text. A skill title such as
 * `# Skill Security Auditor` opens a section too: it can mark only quoted text as examples.
 */
function classifySecurityEducationLines(lines: string[]): MarkdownLineKind[] {
  let inFence = false;
  let educationHeadingLevel = 0;

  return lines.map((line) => {
    if (MARKDOWN_FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      return 'quoted';
    }
    if (inFence || MARKDOWN_BLOCKQUOTE_PATTERN.test(line)) return 'quoted';

    // A nested education heading replaces the outer section, so the section ends at the
    // next heading of the nested level. These are the old bounds: the mask never grows.
    const heading = ANY_INDENT_HEADING_PATTERN.exec(line);
    const headingLevel = heading?.[1]?.length ?? 0;
    if (heading && headingLevel <= educationHeadingLevel) educationHeadingLevel = 0;
    if (heading && SECURITY_EDUCATION_HEADING_PATTERN.test(line)) {
      educationHeadingLevel = headingLevel;
    }

    return educationHeadingLevel > 0 ? 'education' : 'plain';
  });
}

/**
 * Masks inline code and double-quoted text in education text. A quote pairs only inside
 * its markdown block, so it can wrap onto the next line of a paragraph. A blank line, a
 * heading, or a line outside the section ends the block.
 */
function maskQuotedEducationText(lines: string[], kinds: MarkdownLineKind[]): string[] {
  const masked = [...lines];
  let block: number[] = [];
  const maskBlock = (): void => {
    const blockLines = maskQuotedSpans(block.map((index) => lines[index]).join('\n')).split('\n');
    block.forEach((lineIndex, offset) => {
      masked[lineIndex] = blockLines[offset] ?? '';
    });
    block = [];
  };

  lines.forEach((line, index) => {
    const isBlockText = kinds[index] === 'education' && line.trim() !== '';
    const isHeading = ANY_INDENT_HEADING_PATTERN.test(line);
    if (!isBlockText || isHeading) maskBlock();
    if (isBlockText) block.push(index);
    if (isHeading) maskBlock();
  });
  maskBlock();

  return masked;
}

/** Masks inline code spans first, because a quote inside a code span is code, not a quote. */
function maskQuotedSpans(text: string): string {
  return maskDoubleQuotes(maskCodeSpans(text));
}

/**
 * Masks inline code spans. As in CommonMark, a backtick run closes at the next run of the
 * same length, so ``Forget `this` text`` is one span. A run without a closer masks nothing.
 * ponytail: a backslash escape still opens a span. Plain backticks quote the same text, so
 * honoring escapes would not shrink what an author can mark as an example.
 */
function maskCodeSpans(text: string): string {
  const chars = text.split('');
  const runs = [...text.matchAll(/`+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  // One backward pass finds, for each run, the next run with the same length.
  const closerOf: Array<number | undefined> = [];
  const nextRunByLength = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (run === undefined) continue;
    closerOf[index] = nextRunByLength.get(run.end - run.start);
    nextRunByLength.set(run.end - run.start, index);
  }

  for (let index = 0; index < runs.length; index += 1) {
    const closerIndex = closerOf[index];
    const opener = runs[index];
    const closer = closerIndex === undefined ? undefined : runs[closerIndex];
    if (opener === undefined || closerIndex === undefined || closer === undefined) continue;
    maskRange(chars, opener.start, closer.end);
    index = closerIndex;
  }

  return chars.join('');
}

/**
 * Masks each double-quoted span from its opening to its closing character. An opener
 * without a closer masks nothing.
 * ponytail: single quotes stay visible, because apostrophes would pair up across prose.
 */
function maskDoubleQuotes(text: string): string {
  const chars = text.split('');
  // No closer after one opener means no closer after a later opener, so search only once.
  const unclosedQuotes = new Set<string>();

  for (let index = 0; index < chars.length; index += 1) {
    const closer = QUOTE_CLOSERS.get(chars[index] ?? '');
    if (closer === undefined || unclosedQuotes.has(closer)) continue;

    const end = text.indexOf(closer, index + 1);
    if (end < 0) {
      unclosedQuotes.add(closer);
      continue;
    }
    maskRange(chars, index, end + 1);
    index = end;
  }

  return chars.join('');
}

/**
 * Suppresses clearly inert security-education examples without hiding active
 * markdown install/run blocks that a skill may ask the agent to execute.
 */
export function maskSecurityEducationExampleContext(content: string, filePath: string): string {
  if (!isMarkdownPromptFile(filePath)) return maskDocumentationExampleContext(content, filePath);
  if (pathLooksDocumentationOnly(filePath))
    return maskDocumentationExampleContext(content, filePath);

  let inFence = false;
  let educationHeadingLevel = 0;

  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      const fence = /^(?:```|~~~)/.test(trimmed);

      if (fence) {
        const masked = educationHeadingLevel > 0 ? maskLine(line) : line;
        inFence = !inFence;
        return masked;
      }

      if (educationHeadingLevel > 0 && inFence) return maskLine(line);

      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (heading) {
        const level = heading[1]?.length ?? 0;
        const title = heading[2] ?? '';
        if (educationHeadingLevel > 0 && level <= educationHeadingLevel) {
          educationHeadingLevel = 0;
        }
        if (
          SECURITY_EXAMPLE_HEADING_PATTERN.test(title) &&
          !ACTIVE_RUNTIME_CONTEXT_PATTERN.test(title)
        ) {
          educationHeadingLevel = level;
          return maskLine(line);
        }
      }

      if (educationHeadingLevel > 0) return maskLine(line);
      if (
        DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line) &&
        SECURITY_EDUCATION_LINE_PATTERN.test(line)
      ) {
        return maskLine(line);
      }

      return line;
    })
    .join('\n');
}

// How the security-education mask treats a markdown line.
type MarkdownLineKind = 'quoted' | 'education' | 'plain';
