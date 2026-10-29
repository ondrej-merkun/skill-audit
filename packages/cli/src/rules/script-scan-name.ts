import { closeSync, openSync, readSync } from 'node:fs';
import { basename, extname } from 'node:path';

const SHELL_EXTENSION = '.sh';

// Rules pick the files they check by name. A script whose name does not end in the extension
// of the language that runs it, such as `scripts/setup`, is scanned with that extension added.
const INTERPRETER_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ['sh', SHELL_EXTENSION],
  ['bash', SHELL_EXTENSION],
  ['dash', SHELL_EXTENSION],
  ['zsh', SHELL_EXTENSION],
  ['ksh', SHELL_EXTENSION],
  ['python', '.py'],
  ['node', '.js'],
]);

// A versioned name, such as python3 or python3.12, runs the language of its base name.
const INTERPRETER_VERSION = /\d[\d.]*$/;

// Extensions that the rule globs scan as code. A file with one of them keeps the rules of its
// own name when nothing tells which program runs it.
const SCRIPT_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.py',
  '.rb',
  '.php',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.jsx',
  '.tsx',
]);

const SHEBANG = '#!';
// Linux reads at most this many bytes of a script to find its shebang line.
const SHEBANG_MAX_BYTES = 256;

/**
 * Returns the scan name of a hook script, such as `setup.sh` for `bash scripts/setup`.
 * `interpreter` is the word that runs the script, or undefined when the command runs the
 * script directly. Returns undefined when the script keeps its own name.
 */
export function hookScriptScanName(
  filePath: string,
  interpreter: string | undefined
): string | undefined {
  return interpreterScanName(filePath, interpreter ?? directRunInterpreter(filePath));
}

/** Returns the scan name of a file without an extension from its shebang line. */
export function shebangScanName(filePath: string): string | undefined {
  // ponytail: only a file without an extension is read, so a scan opens no extra files for
  // named files. A skill's `setup.cfg` with a shebang therefore gets no script rules.
  if (extname(basename(filePath)) !== '') return undefined;

  return interpreterScanName(filePath, shebangInterpreter(readFileHead(filePath)));
}

/** True for a shell, such as `bash` or `/bin/sh`. */
export function isShellInterpreter(word: string | undefined): boolean {
  return word !== undefined && interpreterExtension(word) === SHELL_EXTENSION;
}

/**
 * Adds the extension of the interpreter's language to the file name: `bash scripts/setup.cfg`
 * scans `setup.cfg.sh`. The interpreter ignores the file's own extension, so its language
 * decides the rules. Returns undefined for an unknown interpreter or a name that already
 * ends in that extension.
 */
function interpreterScanName(
  filePath: string,
  interpreter: string | undefined
): string | undefined {
  const extension = interpreter === undefined ? undefined : interpreterExtension(interpreter);
  const name = basename(filePath);
  if (extension === undefined || name.endsWith(extension)) return undefined;

  return `${name}${extension}`;
}

function interpreterExtension(interpreter: string): string | undefined {
  return INTERPRETER_EXTENSIONS.get(basename(interpreter).replace(INTERPRETER_VERSION, ''));
}

/**
 * Returns the program that runs a file that a command names directly: the shebang
 * interpreter, or the shell for a text file without a shebang. execve rejects such a file
 * with ENOEXEC, and the hook's shell then runs it as a shell script.
 */
function directRunInterpreter(filePath: string): string | undefined {
  const head = readFileHead(filePath);
  if (head.startsWith(SHEBANG)) return shebangInterpreter(head);

  // A NUL byte marks a binary, which the system runs itself. An `args` item also arrives
  // here without its program (see hookScripts), so a script extension keeps its own rules.
  const isBinary = head.includes('\0');
  if (isBinary || SCRIPT_EXTENSIONS.has(extname(filePath))) return undefined;
  return 'sh';
}

/** `#!/bin/sh -e` names `/bin/sh`, and `#!/usr/bin/env -S bash -e` names `bash`. */
function shebangInterpreter(head: string): string | undefined {
  if (!head.startsWith(SHEBANG)) return undefined;

  const [program = '', ...args] = head.slice(SHEBANG.length).split('\n')[0].trim().split(/\s+/);
  if (basename(program) !== 'env') return program;

  // env reads its own options and VAR=value assignments before the program name.
  // ponytail: an option with a separate operand, such as `-u NAME`, is read as the program.
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
