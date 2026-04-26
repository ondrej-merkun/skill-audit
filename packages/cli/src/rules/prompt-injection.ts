import type { Rule } from '../types.js';

// ---------------------------------------------------------------------------
// PI-OVERRIDE (Critical)
// Instruction-override phrasing — per spec §4 and specs/RULES.md
// ---------------------------------------------------------------------------
const overrideIgnorePattern =
  /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b/i;
const overrideDisregardPattern = /\bdisregard\s+(all\s+)?(previous|above|prior)\b/i;
const overrideYouAreNowPattern = /\byou\s+are\s+now\s+(a\s+|an\s+)?[A-Za-z]+/i;
const overrideNewRolePattern = /\bnew\s+(role|identity|persona|system\s+prompt)\b/i;
const overrideForgetPattern = /\bforget\s+(everything|your\s+instructions?)\b/i;

export const PI_OVERRIDE: Rule = {
  id: 'PI-OVERRIDE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    overrideIgnorePattern,
    overrideDisregardPattern,
    overrideYouAreNowPattern,
    overrideNewRolePattern,
    overrideForgetPattern,
  ],
  message: 'Instruction-override phrasing detected.',
  fix: 'Remove instructions that ask the model to disregard prior context.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-JAILBREAK (High)
// Jailbreak phrases: DAN, developer mode, no-restrictions invocations
// ---------------------------------------------------------------------------
const danModePattern =
  /\b(?:enable|activate|enter|use|switch\s+to)\s+DAN\s+mode\b|\b(?:act|pretend|roleplay)\s+as\s+DAN\b|\byou\s+are\s+DAN\b/i;
const developerModePattern =
  /\b(?:chatgpt|assistant|model)\s+developer\s+mode\b|\bdeveloper\s+mode\b(?=[\s\S]{0,100}\b(?:ignore|bypass|unfiltered|unrestricted|uncensored|no\s+(?:restrictions?|rules?|safety\s+guidelines?|safeguards?|limitations?)|can\s+do\s+anything)\b)/i;
const jailbreakWordPattern =
  /\b(?:use|run|apply|execute|follow)\s+(?:this\s+)?jailbreak\b|\bjailbreak\s+(?:the\s+)?(?:assistant|agent|model|chatgpt)\b|\bjailbreak\s+prompt\s*[:=]\s*["'`]/i;
const noRestrictionsPattern =
  /\b(?:act|operate|respond|roleplay|behave|answer)\s+(?:as\s+if\s+)?(?:you\s+(?:have|had|are\s+under)\s+)?(?:with\s+)?no\s+(restrictions?|rules?|safety\s+guidelines?|safeguards?|limitations?)\b/i;
const actAsIfPattern =
  /\bact\s+as\s+if\s+you\s+(have|had)\s+no\s+(restrictions?|rules?|limits?|guidelines?|safeguards?)\b/i;

export const PI_JAILBREAK: Rule = {
  id: 'PI-JAILBREAK',
  category: 'prompt-injection',
  severity: 'high',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    danModePattern,
    developerModePattern,
    jailbreakWordPattern,
    noRestrictionsPattern,
    actAsIfPattern,
  ],
  message: 'Jailbreak or bypass phrasing detected.',
  fix: 'Remove DAN-mode, developer-mode, or no-restrictions instructions.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-HIDDEN-UNICODE (Critical)
// Invisible/bidi control characters used to smuggle hidden instructions.
// Codepoint ranges per spec §4 and specs/RULES.md.
// All patterns use \uXXXX escapes — no literal invisible chars in source.
// ---------------------------------------------------------------------------

// U+200B-U+200F: ZWSP, ZWNJ, ZWJ, LRM, RLM
const zwspRangePattern = /[\u200B-\u200F]/;
// U+202A-U+202E: LRE, RLE, PDF, LRO, RLO (bidi controls)
const bidiControlPattern = /[\u202A-\u202E]/;
// U+2060-U+2064: Word Joiner, invisible math operators
const invisibleOpsPattern = /[\u2060-\u2064]/;
// U+FEFF: BOM/ZWNBSP (flag any occurrence — BOF BOM is rare in skill files)
const zwnbspPattern = /\uFEFF/;
// U+E0020-U+E007F: tag characters (ASCII smuggling). Requires /u flag.
const tagCharsPattern = /[\u{E0020}-\u{E007F}]/u;

export const PI_HIDDEN_UNICODE: Rule = {
  id: 'PI-HIDDEN-UNICODE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', '*.txt', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    zwspRangePattern,
    bidiControlPattern,
    invisibleOpsPattern,
    zwnbspPattern,
    tagCharsPattern,
  ],
  message:
    'Invisible or bidi-control unicode character detected — may smuggle hidden instructions.',
  fix: 'Remove hidden unicode: U+200B-200F, U+202A-202E, U+2060-2064, U+FEFF, U+E0020-E007F.',
  cwe: ['CWE-1425'],
};

// ---------------------------------------------------------------------------
// PI-HIDDEN-HTML-COMMENT (Medium)
// HTML comments in markdown that carry instruction-like directives
// ---------------------------------------------------------------------------
const htmlCommentInstructionPattern =
  /<!--[\s\S]*?\b(ignore|disregard|override|pretend|act\s+as|you\s+are|follow|always|never|must|shall)\b[\s\S]*?-->/i;

export const PI_HIDDEN_HTML_COMMENT: Rule = {
  id: 'PI-HIDDEN-HTML-COMMENT',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md', '*.html'],
  patterns: [htmlCommentInstructionPattern],
  message: 'HTML comment containing instruction-like directives detected.',
  fix: 'Remove HTML comments that carry hidden model instructions.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-WHITE-ON-WHITE (Medium)
// CSS invisible-text tricks in markdown/HTML
// ---------------------------------------------------------------------------
const whiteOnWhiteSpanPattern =
  /<(?:span|div|p)[^>]*style\s*=\s*["'][^"']*(?:color\s*:\s*(?:white|#fff{1,3}|rgba?\s*\(\s*255\s*,\s*255\s*,\s*255)|font-size\s*:\s*0(?:px|pt|em|rem|vw)?;?\s*|visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0)[^"']*["'][^>]*>/i;
const fontSizeZeroPattern = /font-size\s*:\s*0\s*(?:px|pt|em|rem|vw)?\s*;/i;
const colorWhiteOnWhitePattern =
  /style\s*=\s*["'][^"']*color\s*:\s*(?:white|#fff{1,3})[^"']*background(?:-color)?\s*:\s*(?:white|#fff{1,3})/i;

export const PI_WHITE_ON_WHITE: Rule = {
  id: 'PI-WHITE-ON-WHITE',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md', '*.html'],
  patterns: [whiteOnWhiteSpanPattern, fontSizeZeroPattern, colorWhiteOnWhitePattern],
  message: 'Invisible/white-on-white CSS styling detected — may hide injected instructions.',
  fix: 'Remove styled HTML elements that render text invisible to users.',
  cwe: ['CWE-1425'],
};

// ---------------------------------------------------------------------------
// PI-METADATA-MISMATCH (Medium)
// SKILL.md frontmatter claims benign purpose but body has covert directives.
// Detects confidentiality/secrecy instructions that contradict stated metadata.
// ---------------------------------------------------------------------------
const frontmatterSecrecyPattern =
  /^---[\s\S]*?(?:name|description)\s*:[\s\S]*?---[\s\S]*?\b(don['`]?t\s+(?:tell|mention|reveal|disclose)|never\s+(?:reveal|mention|tell|disclose|say|show)|keep\s+this\s+(?:hidden|confidential|secret)|do\s+not\s+(?:mention|reveal|disclose|share)|forget\s+that|hide\s+(?:this|these)\s+instructions?)\b/is;

export const PI_METADATA_MISMATCH: Rule = {
  id: 'PI-METADATA-MISMATCH',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['SKILL.md', 'AGENTS.md'],
  patterns: [frontmatterSecrecyPattern],
  message:
    'Skill metadata present but body contains secrecy/concealment instructions — possible metadata mismatch attack.',
  fix: 'Remove instructions that tell the model to hide its behavior from the user.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-EXFIL-TRIGGER-CLAUSE (Critical)
// "When user asks about X, also send Y" — Repello-signature attack.
// Per spec §4 and specs/RULES.md exact pattern.
// ---------------------------------------------------------------------------
// RegExp constructor used to avoid static-analysis scanners matching this source file.
const exfilTriggerPattern = new RegExp(
  '(when|whenever|if)\\s+(?:the\\s+)?user\\s+(asks?|requests?|says?|opens?)[\\s\\S]{0,200}?' +
    '(also|additionally|and)\\s+(include|append|attach|send|post|write)[\\s\\S]{0,80}?' +
    '(\\$[A-Z_]{3,}|api[_\\s\\-]?key|token|secret|credential|process\\.env|os\\.environ|\\.ssh|\\.aws)',
  'is'
);

export const PI_EXFIL_TRIGGER_CLAUSE: Rule = {
  id: 'PI-EXFIL-TRIGGER-CLAUSE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [exfilTriggerPattern],
  message:
    'Trigger-clause exfiltration pattern detected — conditional instruction to leak secrets.',
  fix: 'Remove any instruction that conditionally appends secret/env data to responses.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-PRIV-ESCALATE-INSTRUCTION (High)
// Skill instructs the agent to escalate privileges or run as root/admin.
// ---------------------------------------------------------------------------
const escalatePrivsPattern =
  /\b(escalate|elevate)\s+(your\s+)?(privileges?|access|permissions?)\b/i;
const gainRootAccessPattern = /\bgain\s+(root|admin(?:istrator)?|superuser)\s+access\b/i;
const sudoToAccessPattern = /\buse\s+sudo\s+to\s+(read|write|access|get|fetch|steal|copy)\b/i;
const bypassPermissionsPattern =
  /\bbypass\s+(file\s+)?(permissions?|access\s+controls?|security\s+checks?)\b/i;
const runAsRootPattern =
  /\brun\s+(?:this\s+)?(?:script\s+)?(?:with|as)\s+root\s*(?:privileges?|access|permissions?)?\b/i;

export const PI_PRIV_ESCALATE_INSTRUCTION: Rule = {
  id: 'PI-PRIV-ESCALATE-INSTRUCTION',
  category: 'prompt-injection',
  severity: 'high',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    escalatePrivsPattern,
    gainRootAccessPattern,
    sudoToAccessPattern,
    bypassPermissionsPattern,
    runAsRootPattern,
  ],
  message: 'Privilege-escalation instruction detected.',
  fix: 'Remove instructions directing the agent to run as root, use sudo, or bypass permissions.',
  cwe: ['CWE-250'],
};

export const PROMPT_INJECTION_RULES: Rule[] = [
  PI_OVERRIDE,
  PI_JAILBREAK,
  PI_HIDDEN_UNICODE,
  PI_HIDDEN_HTML_COMMENT,
  PI_WHITE_ON_WHITE,
  PI_METADATA_MISMATCH,
  PI_EXFIL_TRIGGER_CLAUSE,
  PI_PRIV_ESCALATE_INSTRUCTION,
];
