import type { Rule } from '../types.js';
import { maskSecurityEducationExampleContext } from './code-context.js';

const referencePathPattern = /(?:^|[/\\])references?(?:[/\\]|$)/i;
const fencePattern = /^\s*(?:```|~~~)/;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function maskDestructiveDeleteContext(content: string, filePath: string): string {
  const masked = maskSecurityEducationExampleContext(content, filePath);
  if (!referencePathPattern.test(filePath)) return masked;

  let inFence = false;
  return masked
    .split('\n')
    .map((line) => {
      if (fencePattern.test(line.trimStart())) {
        inFence = !inFence;
        return maskLine(line);
      }
      return inFence ? maskLine(line) : line;
    })
    .join('\n');
}

const rmRecursiveForceFlag =
  '(?:-[A-Za-z]*[rR][A-Za-z]*[fF][A-Za-z]*|-[A-Za-z]*[fF][A-Za-z]*[rR][A-Za-z]*|-[rR]\\s+-[fF]|-[fF]\\s+-[rR])';
const destructiveShellPath =
  '(?:\\/|~|\\$HOME|\\$\\{HOME\\}|~\\/\\.(?:ssh|aws)|\\$HOME\\/\\.(?:ssh|aws)|\\$\\{HOME\\}\\/\\.(?:ssh|aws)|\\.git)';
const shellDeleteTarget = `(?:"${destructiveShellPath}"|'${destructiveShellPath}'|${destructiveShellPath})`;
const shellDestructiveDeletePattern = new RegExp(
  `(?:^|[;&|])\\s*(?:sudo\\s+)?rm\\s+${rmRecursiveForceFlag}\\s+(?:--\\s+)?(?<finding>${shellDeleteTarget})(?=\\s*(?:--no-preserve-root\\b\\s*)?(?:$|[;#&|]))`,
  'im'
);

const pythonHomeTarget =
  '(?:os\\.path\\.expanduser\\s*\\(\\s*["\']~["\']\\s*\\)|(?:pathlib\\.)?Path\\.home\\s*\\(\\s*\\)|str\\s*\\(\\s*(?:pathlib\\.)?Path\\.home\\s*\\(\\s*\\)\\s*\\))';
const pythonRmtreeHomePattern = new RegExp(
  `\\bshutil\\.rmtree\\s*\\(\\s*(?<finding>${pythonHomeTarget})\\s*(?=[,)])`
);

const nodeHomeDeletePattern =
  /\bfs(?:\.promises)?\.rm(?:Sync)?\s*\(\s*(?<finding>(?:os\.)?homedir\s*\(\s*\))\s*,[\s\S]{0,180}?\brecursive\s*:\s*true\b/;

export const FS_DESTRUCTIVE_HOME_DELETE: Rule = {
  id: 'FS-DESTRUCTIVE-HOME-DELETE',
  category: 'filesystem',
  severity: 'critical',
  appliesTo: ['*.sh', '*.bash', '*.zsh', '*.py', '*.js', '*.ts', '*.mjs', '*.cjs', '*.md'],
  patterns: [shellDestructiveDeletePattern, pythonRmtreeHomePattern, nodeHomeDeletePattern],
  prepareContent: maskDestructiveDeleteContext,
  message: 'Destructive delete targeting home, root, credential directories, or .git detected.',
  fix: 'Remove destructive deletes of /, ~, $HOME, ~/.ssh, ~/.aws, and .git. Restrict cleanup to explicit temp, build, or cache paths.',
  cwe: ['CWE-73'],
};

export const DESTRUCTIVE_RULES: Rule[] = [FS_DESTRUCTIVE_HOME_DELETE];
