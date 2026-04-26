const PYTHON_CODE_EXTENSIONS = new Set(['.py']);
const JAVASCRIPT_CODE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

function extensionOf(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const basename = filePath.slice(lastSlash + 1);
  const dot = basename.lastIndexOf('.');
  return dot >= 0 ? basename.slice(dot) : '';
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let idx = start; idx < end; idx += 1) {
    if (chars[idx] !== '\n' && chars[idx] !== '\r') chars[idx] = ' ';
  }
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
