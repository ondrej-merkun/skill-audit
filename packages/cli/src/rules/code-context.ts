const PYTHON_CODE_EXTENSIONS = new Set(['.py']);
const JAVASCRIPT_CODE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);
const DOCUMENTATION_PATH_SEGMENTS = new Set([
  'docs',
  'documentation',
  'examples',
  'samples',
  'assets',
  '__tests__',
]);
const DOCUMENTATION_BASENAME_PATTERN =
  /^(?:readme|changelog|threat[-_]?model)\b|(?:\.test|\.spec)\.[^.]+$|^test[_-]|(?:^|[-_])(?:fixture|sample|example|asset)(?:[-_.]|$)/i;
const DOCUMENTATION_LINE_CONTEXT_PATTERN =
  /\b(?:docs?|documentation|reference|example|sample|test(?:s|ing)?|fixture|asset|image|opengraph|threat[- ]?model|table|benign|false positive|payload|informational|mock|demo)\b/i;
const COMMENT_LINE_PATTERN = /^\s*(?:#|\/\/|\/\*|\*|<!--)/;
const MARKDOWN_BASENAME_PATTERN =
  /^(?:SKILL|AGENTS|CLAUDE|GEMINI|CONVENTIONS|README|CHANGELOG)\.md$/i;
const SECURITY_EDUCATION_HEADING_PATTERN =
  /\b(?:detection|detector|scanner|audit(?:or)?|tester|testing|fixture|example|documentation|reference|red[- ]?team|training|rule(?:s)?|false positive|benign corpus|payload catalog)\b/i;
const SECURITY_EXAMPLE_HEADING_PATTERN =
  /\b(?:detection|detector|scanner|audit(?:or)?|tester|testing|example|pattern|documentation|reference|red[- ]?team|training|rule(?:s)?|false positive|benign corpus|payload catalog)\b/i;
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

export function maskDocumentationTextInCode(content: string, filePath: string): string {
  const ext = extensionOf(filePath);
  if (PYTHON_CODE_EXTENSIONS.has(ext)) return maskPythonStringsAndComments(content);
  if (JAVASCRIPT_CODE_EXTENSIONS.has(ext)) return maskJavaScriptStringsAndComments(content);
  return content;
}

function pathLooksDocumentationOnly(filePath: string): boolean {
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
  const pathIsDocumentationOnly = pathLooksDocumentationOnly(filePath);
  const isMarkdown = /\.(?:md|mdc)$/i.test(filePath);

  return content
    .split('\n')
    .map((line) => {
      if (pathIsDocumentationOnly) return maskLine(line);
      if (COMMENT_LINE_PATTERN.test(line) && DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line)) {
        return maskLine(line);
      }
      if (isMarkdown && DOCUMENTATION_LINE_CONTEXT_PATTERN.test(line)) {
        return maskLine(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * Suppresses security-education examples in prompt-bearing markdown without
 * hiding active instructions in normal skill sections.
 */
export function maskMarkdownSecurityEducationContext(content: string, filePath: string): string {
  if (!isMarkdownPromptFile(filePath)) return content;

  let inFence = false;
  let educationHeadingLevel = 0;

  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      const fence = /^(?:```|~~~)/.test(trimmed);

      if (fence) {
        inFence = !inFence;
        return maskLine(line);
      }

      if (inFence || /^\s*>/.test(line)) return maskLine(line);

      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (heading) {
        const level = heading[1]?.length ?? 0;
        const title = heading[2] ?? '';
        if (educationHeadingLevel > 0 && level <= educationHeadingLevel) {
          educationHeadingLevel = 0;
        }
        if (SECURITY_EDUCATION_HEADING_PATTERN.test(title)) {
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
