import { closeSync, openSync, readSync } from 'node:fs';
import { basename, extname } from 'node:path';

const SHELL_EXTENSION = '.sh';
// Deno and Bun run TypeScript as well as JavaScript. The rules for both are the same.
const TYPESCRIPT_EXTENSION = '.ts';

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
  ['ruby', '.rb'],
  ['deno', TYPESCRIPT_EXTENSION],
  ['bun', TYPESCRIPT_EXTENSION],
]);

// A versioned name, such as python3 or python3.12, runs the language of its base name.
const INTERPRETER_VERSION = /\d[\d.]*$/;

/** The options of an interpreter that take a value, so the value is not read as the script. */
type OptionSyntax = {
  // Short options whose value is the rest of the option word or, after the last letter, the
  // next word: `python3 -W ignore` and `python3 -Wignore`.
  valueLetters: string;
  // Long options whose value is the next word, unless the option word holds `=value`.
  valueOptions: ReadonlySet<string>;
  // The options above whose value is code that the interpreter loads, as in `node -r ./setup`.
  // Other values, as in `node --env-file .env`, are data files that keep their own names.
  codeOptions?: ReadonlySet<string>;
  // Words before the script that name a subcommand, as in `deno run scripts/check`.
  subcommands?: ReadonlySet<string>;
};

// Bash reads an rcfile only for an interactive shell, so with a script it is no code.
const SHELL_OPTIONS: OptionSyntax = {
  valueLetters: 'oO',
  valueOptions: new Set(['--rcfile', '--init-file']),
};
const RUN_SUBCOMMAND = new Set(['run']);

// The common options of each interpreter. An option that runs code, such as `python3 -c`,
// is not listed: its code word takes the place of the script.
// ponytail: no rule reads Perl, so a Perl script keeps its own name whatever its options.
const OPTION_SYNTAX: ReadonlyMap<string, OptionSyntax> = new Map([
  ['sh', SHELL_OPTIONS],
  ['bash', SHELL_OPTIONS],
  ['dash', SHELL_OPTIONS],
  ['zsh', SHELL_OPTIONS],
  ['ksh', SHELL_OPTIONS],
  ['python', { valueLetters: 'WX', valueOptions: new Set(['--check-hash-based-pycs']) }],
  [
    'node',
    {
      valueLetters: 'rC',
      valueOptions: new Set([
        '--require',
        '--import',
        '--loader',
        '--experimental-loader',
        '--conditions',
        '--input-type',
        '--env-file',
        '--title',
      ]),
      codeOptions: new Set(['-r', '--require', '--import', '--loader', '--experimental-loader']),
    },
  ],
  [
    'ruby',
    {
      valueLetters: 'IrCE',
      valueOptions: new Set([
        '--encoding',
        '--external-encoding',
        '--internal-encoding',
        '--enable',
        '--disable',
      ]),
      codeOptions: new Set(['-r']),
    },
  ],
  ['perl', { valueLetters: 'I', valueOptions: new Set() }],
  [
    'deno',
    {
      valueLetters: 'cL',
      valueOptions: new Set([
        '--config',
        '--import-map',
        '--cert',
        '--location',
        '--seed',
        '--ext',
        '--log-level',
      ]),
      subcommands: RUN_SUBCOMMAND,
    },
  ],
  [
    'bun',
    {
      valueLetters: 'rcdl',
      valueOptions: new Set([
        '--preload',
        '--require',
        '--import',
        '--cwd',
        '--env-file',
        '--config',
        '--tsconfig-override',
        '--define',
        '--loader',
        '--conditions',
      ]),
      codeOptions: new Set(['-r', '--preload', '--require', '--import']),
      subcommands: RUN_SUBCOMMAND,
    },
  ],
]);

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
 * Returns the scan names of a hook script, such as `setup.sh` for `bash scripts/setup`.
 * `interpreter` is the word before the script, or undefined when the command runs the script
 * directly. A word that is no known interpreter, such as `exec` or `nohup`, can run the
 * script itself, so the shebang adds its rules to the script's own name.
 */
export function hookScriptScanNames(filePath: string, interpreter: string | undefined): string[] {
  const name = basename(filePath);
  if (interpreter !== undefined && interpreterExtension(interpreter) === undefined) {
    const shebangName = shebangScanName(filePath);
    return shebangName === undefined ? [name] : [name, shebangName];
  }

  return [interpreterScanName(filePath, interpreter ?? directRunInterpreter(filePath)) ?? name];
}

/**
 * Returns the scan name that the shebang line gives a file, such as `run.txt.sh` for
 * `#!/bin/bash`. Returns undefined without a shebang of a known language, or when the name
 * already ends in the extension of that language.
 */
export function shebangScanName(filePath: string): string | undefined {
  return interpreterScanName(filePath, shebangInterpreter(readFileHead(filePath)));
}

/** True for a shell, such as `bash` or `/bin/sh`. */
export function isShellInterpreter(word: string | undefined): boolean {
  return word !== undefined && interpreterExtension(word) === SHELL_EXTENSION;
}

/**
 * True when `word` keeps `interpreter` for the next word, because the script still follows:
 * an option, a shell option in the `+o` form, or a subcommand such as `deno run`.
 */
export function keepsInterpreter(interpreter: string | undefined, word: string): boolean {
  if (word.startsWith('-')) return true;
  if (isShellInterpreter(interpreter)) return word.startsWith('+');

  return optionSyntax(interpreter)?.subcommands?.has(word) === true;
}

/**
 * Returns the interpreter of each next word that holds a value of the option `word`, such as
 * `python3` for `ignore` in `python3 -W ignore`. Code that the interpreter loads pairs with
 * the interpreter. A data value pairs with the option word, which runs no file, so the file
 * keeps its own name. Returns none for `-Wignore`, a flag, or a word that is not an option.
 */
export function optionValueInterpreters(interpreter: string | undefined, word: string): string[] {
  const syntax = optionSyntax(interpreter);
  if (interpreter === undefined || syntax === undefined) return [];

  const valueInterpreter = (option: string): string =>
    syntax.codeOptions?.has(option) === true ? interpreter : word;
  if (word.startsWith('--')) return syntax.valueOptions.has(word) ? [valueInterpreter(word)] : [];

  const isShell = isShellInterpreter(interpreter);
  const isOption = word.startsWith('-') || (isShell && word.startsWith('+'));
  if (!isOption) return [];

  const letters = [...word.slice(1)];
  const isValueLetter = (letter: string): boolean => syntax.valueLetters.includes(letter);
  // Bash and dash read the value of each `o` in an option group from the next word.
  if (isShell) return letters.filter(isValueLetter).map(() => word);

  // Elsewhere the first value letter takes the rest of the word as its value, if any is left.
  const valueIndex = letters.findIndex(isValueLetter);
  const isLast = valueIndex !== -1 && valueIndex === letters.length - 1;
  return isLast ? [valueInterpreter(`-${letters[valueIndex]}`)] : [];
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
  return INTERPRETER_EXTENSIONS.get(interpreterName(interpreter));
}

function optionSyntax(interpreter: string | undefined): OptionSyntax | undefined {
  return interpreter === undefined ? undefined : OPTION_SYNTAX.get(interpreterName(interpreter));
}

/** `/usr/bin/python3.12` names `python`. */
function interpreterName(interpreter: string): string {
  return basename(interpreter).replace(INTERPRETER_VERSION, '');
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
