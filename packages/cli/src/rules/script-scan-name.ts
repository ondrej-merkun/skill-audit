import { closeSync, openSync, readSync } from 'node:fs';
import { basename, extname } from 'node:path';

// Rules pick the files they check by name. A script without a file extension, such as
// `scripts/setup`, gets the extension that the rule globs use for the language that runs it.
const INTERPRETER_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ['sh', '.sh'],
  ['bash', '.sh'],
  ['dash', '.sh'],
  ['zsh', '.sh'],
  ['ksh', '.sh'],
  ['python', '.py'],
  ['python3', '.py'],
  ['node', '.js'],
]);

// Linux reads at most this many bytes of a script to find its shebang line.
const SHEBANG_MAX_BYTES = 256;

/**
 * Returns the scan name of a script without a file extension that `interpreter` runs,
 * such as `setup.sh` for `bash scripts/setup`. Returns undefined when the file has an
 * extension or the interpreter is unknown.
 */
export function interpreterScanName(
  filePath: string,
  interpreter: string | undefined
): string | undefined {
  const name = basename(filePath);
  if (extname(name) !== '' || interpreter === undefined) return undefined;

  const extension = INTERPRETER_EXTENSIONS.get(basename(interpreter));
  return extension === undefined ? undefined : `${name}${extension}`;
}

/** Returns the scan name of a script without a file extension from its shebang line. */
export function shebangScanName(filePath: string): string | undefined {
  // Only a file without an extension is read, so a scan opens no extra files for named scripts.
  if (extname(basename(filePath)) !== '') return undefined;

  return interpreterScanName(filePath, shebangInterpreter(readFileHead(filePath)));
}

/** `#!/bin/sh -e` names `/bin/sh`, and `#!/usr/bin/env -S bash -e` names `bash`. */
function shebangInterpreter(head: string): string | undefined {
  if (!head.startsWith('#!')) return undefined;

  const [program = '', ...args] = head.slice(2).split('\n')[0].trim().split(/\s+/);
  if (basename(program) !== 'env') return program;

  // env reads its own options and VAR=value assignments before the program name.
  return args.find((arg) => !arg.startsWith('-') && !arg.includes('='));
}

/** Reads the first bytes of a file. An unreadable file has an empty head. */
function readFileHead(filePath: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(SHEBANG_MAX_BYTES);
    const bytesRead = readSync(fd, head, 0, SHEBANG_MAX_BYTES, 0);
    return head.toString('utf8', 0, bytesRead);
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
