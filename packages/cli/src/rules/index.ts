import type { Rule } from '../types.js';
import { CODE_EXECUTION_RULES } from './code-execution.js';
import { DEPENDENCIES_RULES } from './dependencies.js';
import { DESTRUCTIVE_RULES } from './destructive.js';
import { FILESYSTEM_RULES } from './filesystem.js';
import { GIT_HISTORY_RULES } from './git-history.js';
import { NETWORK_EXFIL_RULES } from './network-exfil.js';
import { OBFUSCATION_RULES } from './obfuscation.js';
import { PROMPT_INJECTION_RULES } from './prompt-injection.js';
import { SECRETS_RULES } from './secrets.js';
import { SKILL_SPECIFIC_RULES } from './skill-specific.js';

export const ALL_RULES: Rule[] = [
  ...CODE_EXECUTION_RULES,
  ...DEPENDENCIES_RULES,
  ...DESTRUCTIVE_RULES,
  ...FILESYSTEM_RULES,
  ...GIT_HISTORY_RULES,
  ...NETWORK_EXFIL_RULES,
  ...OBFUSCATION_RULES,
  ...PROMPT_INJECTION_RULES,
  ...SECRETS_RULES,
  ...SKILL_SPECIFIC_RULES,
];
