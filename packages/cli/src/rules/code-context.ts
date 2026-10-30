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
// A file name that DOCUMENTATION_BASENAME_PATTERN does not match.
const OPERATIVE_FILE_STEM = 'operative-file';
const DOCUMENTATION_LINE_CONTEXT_PATTERN =
  /\b(?:docs?|documentation|reference|example|sample|test(?:s|ing)?|fixture|asset|image|opengraph|threat[- ]?model|pattern|risk|fix|table|benign|false positive|payload|informational|mock|demo)\b/i;
const COMMENT_LINE_PATTERN = /^\s*(?:#|\/\/|\/\*|\*|<!--)/;
const REGEX_AFTER_CHAR_PATTERN = /[(,=:[!&|?{;+\-*%<>~^]/;
// A keyword after a dot is a property name, as in `obj.return / 2`.
const REGEX_AFTER_KEYWORD_PATTERN =
  /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;
// The keyword window also holds the character before the keyword.
const LONGEST_REGEX_KEYWORD = 'typeof';
const POSTFIX_OPERATOR_PATTERN = /^(?:\+\+|--)$/;
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
// The headings that opened the old whole-section mask of the code-risk rules. They still bound
// a code-example section, so the narrower mask never hides text that the old one showed.
const SECURITY_EXAMPLE_HEADING_PATTERN =
  /\b(?:detection|detector|scanner|audit(?:or)?|tester|testing|example|pattern|documentation|reference|threat|attack|red[- ]?team|training|rule(?:s)?|false positive|benign corpus|payload catalog)\b/i;
// Words that frame the code of a section as hostile or flagged material, not as steps to run.
// Words such as testing, rules, or reference also name sections of operative steps.
const HOSTILE_EXAMPLE_HEADING_PATTERN =
  /\b(?:attacks?|malicious|payloads?|exploits?|injections?|red[- ]?team(?:ing)?|threats?|false positives?|benign corpus|detections?|detectors?|detect(?:s|ed)|flag(?:s|ged)?|bad|unsafe|dangerous|insecure|risky|vulnerable|anti[- ]?patterns?)\b/i;
const SECURITY_EDUCATION_LINE_PATTERN =
  /\b(?:quoted attacks?|fenced examples?|example payload|malicious example|benign example|scanner test|tester fixture|rule documentation|detection docs?|should flag|must flag|flags? quoted|false positive|red[- ]?team training)\b/i;
// A heading that names operative work, such as `## Install` or `### Lab setup`.
const ACTIVE_RUNTIME_CONTEXT_PATTERN =
  /\b(?:operative|active|runtime|run(?:s|time)?|execute|executes?|install|bootstrap|set[- ]?up|usage|quick[- ]?start|getting started)\b/i;

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

export function pythonStringStart(content: string, quoteIndex: number): number {
  let start = quoteIndex;
  while (start > 0 && quoteIndex - start < 3 && isStringPrefixChar(content[start - 1] ?? '')) {
    start -= 1;
  }
  return start;
}

function maskPythonStringsAndComments(content: string, keepString?: KeepString): string {
  const chars = content.split('');
  const trail: CodeTrail = { last: -1, beforeLast: -1 };
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

      if (!keepString?.(chars, trail)) maskRange(chars, start, end);
      pushCode(trail, end - 1);
      idx = end;
      continue;
    }

    // A prefix such as `r` in r'...' belongs to the string, so the trail keeps the code before it.
    const prefixEnd = pythonStringPrefixEnd(content, idx);
    if (prefixEnd !== undefined) {
      idx = prefixEnd;
      continue;
    }

    if (!isBlank(char)) pushCode(trail, idx);
    idx += 1;
  }

  return chars.join('');
}

// Returns the index of the quote after a string prefix such as `r` or `Rb` at `start`, or
// undefined when no prefixed string starts there.
function pythonStringPrefixEnd(content: string, start: number): number | undefined {
  if (!isStringPrefixChar(content[start] ?? '') || /\w/.test(content[start - 1] ?? '')) {
    return undefined;
  }

  const end = isStringPrefixChar(content[start + 1] ?? '') ? start + 2 : start + 1;
  return content[end] === '"' || content[end] === "'" ? end : undefined;
}

function maskJavaScriptStringsAndComments(content: string, keepString?: KeepString): string {
  const chars = content.split('');
  // One brace depth per open `${` of a template literal. A `}` at depth 0 closes the
  // interpolation, and the template text goes on after it.
  const interpolationDepths: number[] = [];
  const trail: CodeTrail = { last: -1, beforeLast: -1 };
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

    // A regex literal stays visible, but a quote in it does not open a string.
    const regexEnd = char === '/' ? regexLiteralEnd(content, chars, idx, trail) : undefined;
    if (regexEnd !== undefined) {
      pushCode(trail, regexEnd - 1);
      idx = regexEnd;
      continue;
    }

    const depth = interpolationDepths.at(-1);
    if (depth !== undefined && (char === '{' || char === '}')) {
      if (char === '}' && depth === 0) {
        interpolationDepths.pop();
        idx = maskTemplateText(content, chars, idx, interpolationDepths, false);
        pushCode(trail, idx - 1);
        continue;
      }
      interpolationDepths[interpolationDepths.length - 1] = char === '{' ? depth + 1 : depth - 1;
    }

    if (char === '`') {
      const keep = keepString?.(chars, trail) ?? false;
      idx = maskTemplateText(content, chars, idx, interpolationDepths, keep);
      pushCode(trail, idx - 1);
      continue;
    }

    if (char === '"' || char === "'") {
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
        if (content[end] === '\n' || content[end] === '\r') break;
        end += 1;
      }

      if (!keepString?.(chars, trail)) maskRange(chars, idx, end);
      pushCode(trail, end - 1);
      idx = end;
      continue;
    }

    if (!isBlank(char)) pushCode(trail, idx);
    idx += 1;
  }

  return chars.join('');
}

/**
 * Masks template text from `start`, the opening backtick or the `}` that closes an
 * interpolation, to the closing backtick or the next `${`. The code in an interpolation stays
 * visible. Returns the index after the masked text.
 */
function maskTemplateText(
  content: string,
  chars: string[],
  start: number,
  interpolationDepths: number[],
  keep: boolean
): number {
  let end = start + 1;

  while (end < content.length) {
    if (content[end] === '\\') {
      end += 2;
      continue;
    }
    if (content[end] === '`') {
      end += 1;
      break;
    }
    if (content[end] === '$' && content[end + 1] === '{') {
      end += 2;
      interpolationDepths.push(0);
      break;
    }
    end += 1;
  }

  end = Math.min(end, content.length);
  if (!keep) maskRange(chars, start, end);
  return end;
}

// A slash opens a regex literal where an expression starts: at the start of the code, after an
// operator or an open bracket, or after a keyword such as `return`. After a name, a number, a
// closing bracket, a string, or a postfix `++` or `--`, it divides.
function regexLiteralEnd(
  content: string,
  masked: readonly string[],
  start: number,
  trail: Readonly<CodeTrail>
): number | undefined {
  const before = trail.last;
  const keywordWindow = masked.slice(
    Math.max(0, before - LONGEST_REGEX_KEYWORD.length),
    before + 1
  );
  const afterPostfix =
    before > 0 &&
    trail.beforeLast === before - 1 &&
    POSTFIX_OPERATOR_PATTERN.test(content.slice(before - 1, before + 1));
  const startsExpression =
    !afterPostfix &&
    (before < 0 ||
      REGEX_AFTER_CHAR_PATTERN.test(content[before] ?? '') ||
      REGEX_AFTER_KEYWORD_PATTERN.test(keywordWindow.join('')));
  if (!startsExpression) return undefined;

  // ponytail: a `/` in a class such as `/[/'"]/` ends the literal early. Tracking classes would
  // let each unclosed `[` scan to the end of the line, which is quadratic on a long minified line.
  for (let idx = start + 1; idx < content.length; idx += 1) {
    const char = content[idx];
    if (char === '\\') idx += 1;
    else if (char === '\n' || char === '\r') return undefined;
    else if (char === '/') return idx + 1;
  }

  return undefined;
}

function pushCode(trail: CodeTrail, index: number): void {
  trail.beforeLast = trail.last;
  trail.last = index;
}

// The ASCII check comes first, because the maskers run this for every code character. The
// regex catches Unicode whitespace such as U+00A0.
function isBlank(char: string): boolean {
  return char <= ' ' || (char > '~' && /\s/.test(char));
}

export function maskShellCommentsAndSingleQuotedStrings(content: string): string {
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

/**
 * Masks comments and strings in Python, JavaScript, and shell code. In Python and JavaScript,
 * `keepString` can keep a string that the code itself reads, such as a module specifier.
 */
export function maskDocumentationTextInCode(
  content: string,
  filePath: string,
  keepString?: KeepString
): string {
  const ext = extensionOf(filePath);
  if (PYTHON_CODE_EXTENSIONS.has(ext)) return maskPythonStringsAndComments(content, keepString);
  if (JAVASCRIPT_CODE_EXTENSIONS.has(ext))
    return maskJavaScriptStringsAndComments(content, keepString);
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
 * Rewrites the path of a file that the agent reads or runs, so that pathLooksDocumentationOnly
 * does not match it. The dirs that look like docs go, and a scan name that looks like docs
 * (`README.md`, `test-hook.sh`) becomes a neutral name with the same extension. The other dirs
 * stay, because some rules read them, such as the `.gemini` dir of Gemini settings.
 */
export function operativeScanPath(filePath: string, scanName: string): string {
  const dirs = filePath.replaceAll('\\', '/').split('/').slice(0, -1);
  const operativeDirs = dirs.filter(
    (segment) => !DOCUMENTATION_PATH_SEGMENTS.has(segment.toLowerCase())
  );
  const name = DOCUMENTATION_BASENAME_PATTERN.test(scanName)
    ? `${OPERATIVE_FILE_STEM}${extensionOf(scanName)}`
    : scanName;
  return [...operativeDirs, name].join('/');
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
  return maskEducationLines(lines, classifySecurityEducationLines(lines));
}

/**
 * Masks quoted lines, the quoted text in education lines, and a line that combines a
 * documentation word with a detection note such as "should flag" in any section.
 */
function maskEducationLines(lines: string[], kinds: MarkdownLineKind[]): string {
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
 * Suppresses quoted security-education examples in markdown for the code-risk rules without
 * hiding a command that the skill asks the agent to run. Fenced code, blockquotes, inline code,
 * and double-quoted text are examples only in a code-example section, whose heading frames its
 * code as hostile or flagged material (`## Attack examples`, `## Detection rules`). Elsewhere,
 * fenced code is a step that the agent runs, also under `## Testing`, `## Quick reference`, or
 * a skill title such as `# docs-skill-tester`. A heading never hides plain prose.
 */
export function maskSecurityEducationExampleContext(content: string, filePath: string): string {
  if (!isMarkdownPromptFile(filePath) || pathLooksDocumentationOnly(filePath)) {
    return maskDocumentationExampleContext(content, filePath);
  }

  const lines = content.split('\n');
  const isSkillMd = basenameOf(filePath) === SKILL_MD_BASENAME;
  return maskEducationLines(lines, classifyCodeExampleLines(lines, isSkillMd));
}

/**
 * Marks fenced code and blockquotes in a code-example section as quoted, and the other lines of
 * the section as education text. A section opens and ends where the old whole-section mask
 * opened and ended one, so the mask never grows. It is a code-example section only when a
 * heading that opened it also frames its code as hostile or flagged. In SKILL.md, the title
 * names the skill and opens no code-example section. A heading that names operative work
 * (`### Lab setup`) ends the section, and a `#` line in fenced code is a comment, not a heading.
 */
function classifyCodeExampleLines(lines: string[], isSkillMd: boolean): MarkdownLineKind[] {
  let inFence = false;
  let sectionLevel = 0;
  let isExampleSection = false;

  return lines.map((line) => {
    const isFence = MARKDOWN_FENCE_PATTERN.test(line);
    if (isFence) inFence = !inFence;
    if (isFence || inFence || MARKDOWN_BLOCKQUOTE_PATTERN.test(line)) {
      return isExampleSection ? 'quoted' : 'plain';
    }

    const heading = ANY_INDENT_HEADING_PATTERN.exec(line);
    if (heading) {
      const headingLevel = heading[1]?.length ?? 0;
      const isActive = ACTIVE_RUNTIME_CONTEXT_PATTERN.test(line);
      if (headingLevel <= sectionLevel || isActive) {
        sectionLevel = 0;
        isExampleSection = false;
      }
      if (!isActive && SECURITY_EXAMPLE_HEADING_PATTERN.test(line)) {
        // A nested heading replaces the outer section and keeps its example kind.
        sectionLevel = headingLevel;
        isExampleSection ||=
          HOSTILE_EXAMPLE_HEADING_PATTERN.test(line) && !(isSkillMd && headingLevel === 1);
      }
    }

    return isExampleSection ? 'education' : 'plain';
  });
}

// How the security-education mask treats a markdown line.
type MarkdownLineKind = 'quoted' | 'education' | 'plain';

/**
 * The indices of the last two code characters before the masker's position, or -1. A string or
 * template literal counts as one code character at its last index. Comments do not count.
 */
export type CodeTrail = { last: number; beforeLast: number };

// Decides whether the masker keeps the string that starts at its position. `masked` holds the
// content masked so far.
export type KeepString = (masked: readonly string[], trail: Readonly<CodeTrail>) => boolean;
