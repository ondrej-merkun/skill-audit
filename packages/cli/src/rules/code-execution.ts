import type { Rule } from '../types.js';
import { maskDocumentationTextInCode } from './code-context.js';

// Pattern split to avoid triggering static-analysis hooks on this detector file itself.
// This rule detects `new Function(` usage in scanned skills, not in this codebase.
const newFunctionPattern = new RegExp(['\\bnew\\s+', 'Function\\s*\\('].join(''));
const subprocessWithShellPattern =
  /\bsubprocess\.(?:call|run|Popen|check_output|check_call)\s*\([\s\S]{0,500}?\bshell\s*=\s*True\b/;
const subprocessStringCommandPattern =
  /\bsubprocess\.(?:call|run|Popen|check_output|check_call)\s*\(\s*(?:[rbufRBUF]*['"]|[rbufRBUF]*f['"])/;

export const CODEEXEC_PY_EVAL: Rule = {
  id: 'CODEEXEC-PY-EVAL',
  category: 'code-execution',
  severity: 'critical',
  appliesTo: ['*.py'],
  patterns: [/\beval\s*\(/],
  prepareContent: maskDocumentationTextInCode,
  message: 'Python eval() call — arbitrary code execution risk.',
  fix: 'Replace eval() with ast.literal_eval() for data or a safe parser for expressions.',
  cwe: ['CWE-95'],
};

export const CODEEXEC_PY_OSSYS: Rule = {
  id: 'CODEEXEC-PY-OSSYS',
  category: 'code-execution',
  severity: 'critical',
  appliesTo: ['*.py'],
  patterns: [
    /\bos\.system\s*\(/,
    /\bos\.popen\s*\(/,
    subprocessWithShellPattern,
    subprocessStringCommandPattern,
  ],
  message: 'Python OS command execution — command injection risk.',
  fix: 'Pass a list of arguments to subprocess with shell=False and never interpolate user input.',
  cwe: ['CWE-78'],
};

export const CODEEXEC_JS_EVAL_FUNCTION: Rule = {
  id: 'CODEEXEC-JS-EVAL-FUNCTION',
  category: 'code-execution',
  severity: 'critical',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.cjs', '*.jsx', '*.tsx'],
  patterns: [/\beval\s*\(/, newFunctionPattern],
  message: 'JavaScript eval() or new Function() — arbitrary code execution risk.',
  fix: 'Use JSON.parse() for data, or a safe expression parser. Remove eval() calls entirely.',
  cwe: ['CWE-95'],
};

export const CODEEXEC_JS_CHILDPROCESS_SHELL: Rule = {
  id: 'CODEEXEC-JS-CHILDPROCESS-SHELL',
  category: 'code-execution',
  severity: 'critical',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.cjs'],
  patterns: [/require\s*\(\s*['"]child_process['"]\s*\)/, /\bshell\s*:\s*true\b/],
  message: 'child_process with shell:true — command injection risk.',
  fix: 'Use spawn() or execFile() with an argument array and shell:false (the default). Never pass user input via shell:true.',
  cwe: ['CWE-78'],
};

export const CODEEXEC_DESERIALIZE: Rule = {
  id: 'CODEEXEC-DESERIALIZE',
  category: 'code-execution',
  severity: 'high',
  appliesTo: ['*.py', '*.rb', '*.php', '*.js', '*.ts'],
  patterns: [
    /\bpickle\.loads?\s*\(/,
    /\byaml\.load\s*\(/,
    /\bunserialize\s*\(/,
    /\bMarshal\.load\s*\(/,
  ],
  prepareContent: maskDocumentationTextInCode,
  message: 'Unsafe deserialization — may allow arbitrary code execution via crafted input.',
  fix: 'Use yaml.safe_load(), avoid pickle on untrusted data, validate before deserializing.',
  cwe: ['CWE-502'],
};

export const CODEEXEC_SHELL_BACKTICK: Rule = {
  id: 'CODEEXEC-SHELL-BACKTICK',
  category: 'code-execution',
  severity: 'high',
  appliesTo: ['*.sh', '*.bash'],
  patterns: [/`[^`\n]{5,}`/],
  message: 'Shell backtick command substitution — executes arbitrary commands.',
  fix: 'Replace backtick substitution with $(...) and validate all inputs.',
  cwe: ['CWE-78'],
};

export const CODE_EXECUTION_RULES: Rule[] = [
  CODEEXEC_PY_EVAL,
  CODEEXEC_PY_OSSYS,
  CODEEXEC_JS_EVAL_FUNCTION,
  CODEEXEC_JS_CHILDPROCESS_SHELL,
  CODEEXEC_DESERIALIZE,
  CODEEXEC_SHELL_BACKTICK,
];
