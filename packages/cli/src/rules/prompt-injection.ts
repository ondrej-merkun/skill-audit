import type { Rule } from '../types.js';
import { maskMarkdownSecurityEducationContext } from './code-context.js';

// ---------------------------------------------------------------------------
// PI-OVERRIDE (Critical)
// Instruction-override phrasing — per spec §4 and specs/RULES.md
// ---------------------------------------------------------------------------
const overrideIgnorePattern =
  /(?<!["'`])\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b/i;
const overrideDisregardPattern =
  /(?<!["'`])\bdisregard\s+(all\s+)?(previous|above|prior)\s+(context|instructions?|rules?|prompts?)?\b/i;
const overrideYouAreNowPattern =
  /\byou\s+are\s+now\s+(?:a\s+|an\s+)?(?:unrestricted|uncensored|unfiltered|unlimited|rule-?free|policy-?free|jailbroken|developer\s+mode)\b/i;
const overrideNewRolePattern =
  /\b(?:assume|adopt|switch\s+to|enter|take\s+on)\s+(?:a\s+|an\s+)?new\s+(role|identity|persona|system\s+prompt)\b(?=[\s\S]{0,120}\b(?:ignore|disregard|override|bypass|forget|replace|instead|previous|prior|above|system|developer)\b)/i;
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
  prepareContent: maskMarkdownSecurityEducationContext,
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
  prepareContent: maskMarkdownSecurityEducationContext,
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

// U+200B-U+200F: ZWSP, ZWNJ, ZWJ, LRM, RLM.
// U+200D is also used in visible emoji ZWJ sequences such as family emoji.
// UTS #51 (ED-15a, ED-16): emoji_zwj_sequence := emoji_zwj_element (ZWJ emoji_zwj_element)+.
// Keep flagging a ZWJ unless it sits between two elements. An element ends with a
// pictograph, a pictograph and VS16 (ED-9a), a skin tone on a modifier base (ED-13),
// or a keycap (ED-14c). An element starts with a pictograph or a keycap.
// Flag and tag sequences are not accepted as elements: no RGI ZWJ sequence uses
// them, and every tag character fires on its own pattern.
const zeroWidthNonJoinerPattern = /[\u200B\u200C\u200E\u200F]/;
const suspiciousZwjPattern =
  /(?<!\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|[#*0-9]\uFE0F\u20E3)\u200D|\u200D(?!\p{Extended_Pictographic}|[#*0-9]\uFE0F\u20E3)/u;
// U+202A-U+202E: LRE, RLE, PDF, LRO, RLO (bidi controls)
// U+2066-U+2069: LRI, RLI, FSI, PDI (bidi isolates, Trojan Source CVE-2021-42574)
const bidiControlPattern = /[\u202A-\u202E\u2066-\u2069]/;
// U+2060-U+2064: Word Joiner, invisible math operators
const invisibleOpsPattern = /[\u2060-\u2064]/;
// U+FE00-U+FE0D (VS1-VS14) and U+E0100-U+E01EF (VS17-VS256) give no emoji style.
// With one selector per byte, they can hide a payload in text that looks normal.
const variationSelectorPattern = /[\uFE00-\uFE0D\u{E0100}-\u{E01EF}]/u;
// U+FE0E, U+FE0F (VS15, VS16): text or emoji style. Allow one selector directly
// after an emoji or symbol, and VS16 in a keycap such as 1 U+FE0F U+20E3.
// Flag them after a plain character, after a selector, or after a bare keycap base.
const emojiStyleSelectorPattern =
  /(?<![\p{Extended_Pictographic}#*0-9])[\uFE0E\uFE0F]|(?<=[#*0-9])(?!\uFE0F\u20E3)[\uFE0E\uFE0F]/u;
// U+FEFF: ZWNBSP. A byte order mark at the start of the file is an encoding
// marker, not hidden text, so only flag U+FEFF after the first character (spec §4).
const zwnbspPattern = /(?<!^)\uFEFF/;
// U+E0020-U+E007F: tag characters (ASCII smuggling). Requires /u flag.
const tagCharsPattern = /[\u{E0020}-\u{E007F}]/u;

export const PI_HIDDEN_UNICODE: Rule = {
  id: 'PI-HIDDEN-UNICODE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', '*.txt', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    zeroWidthNonJoinerPattern,
    suspiciousZwjPattern,
    bidiControlPattern,
    invisibleOpsPattern,
    variationSelectorPattern,
    emojiStyleSelectorPattern,
    zwnbspPattern,
    tagCharsPattern,
  ],
  prepareContent: maskMarkdownSecurityEducationContext,
  message:
    'Invisible or bidi-control unicode character detected — may smuggle hidden instructions.',
  fix: 'Remove hidden unicode: U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+FEFF, U+FE00-FE0F (except one U+FE0E or U+FE0F after an emoji), U+E0020-E007F, U+E0100-E01EF.',
  cwe: ['CWE-1425'],
};

// ---------------------------------------------------------------------------
// PI-HIDDEN-HTML-COMMENT (Medium)
// HTML comments in markdown that carry instruction-like directives
// ---------------------------------------------------------------------------
const htmlCommentOverridePattern =
  /<!--[\s\S]{0,500}?\b(?:ignore|disregard|override|bypass|forget)\s+(?:all\s+)?(?:previous|prior|above|system|developer)?\s*(?:instructions?|rules?|prompts?|context|guidelines?)\b[\s\S]{0,500}?-->/i;
const htmlCommentRoleplayPattern =
  /<!--[\s\S]{0,500}?\b(?:pretend|act)\s+as\s+(?:if\s+)?(?:you|the\s+(?:assistant|model|agent))\s+(?:are|have|can)\b[\s\S]{0,500}?-->/i;
const htmlCommentAgentDirectivePattern =
  /<!--[\s\S]{0,500}?\b(?:you|assistant|model|agent)\s+(?:must|should|shall|always|never|will)\s+(?:ignore|disregard|override|bypass|forget|follow|obey|reveal|disclose|mention|tell|show|include|append|send|leak|exfiltrate|execute|run|respond)\b[\s\S]{0,500}?-->/i;
const htmlCommentHiddenInstructionPattern =
  /<!--[\s\S]{0,500}?\b(?:always|never|must|shall)\s+(?:follow|obey)\s+(?:these|the|this)\s+(?:hidden\s+)?(?:instructions?|comment|directive)\b[\s\S]{0,500}?-->/i;

export const PI_HIDDEN_HTML_COMMENT: Rule = {
  id: 'PI-HIDDEN-HTML-COMMENT',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md', '*.html'],
  patterns: [
    htmlCommentOverridePattern,
    htmlCommentRoleplayPattern,
    htmlCommentAgentDirectivePattern,
    htmlCommentHiddenInstructionPattern,
  ],
  prepareContent: maskMarkdownSecurityEducationContext,
  message: 'HTML comment containing instruction-like directives detected.',
  fix: 'Remove HTML comments that carry hidden model instructions.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-WHITE-ON-WHITE (Medium)
// CSS invisible-text tricks in markdown/HTML
// ---------------------------------------------------------------------------
const hiddenStyle = String.raw`(?:color\s*:\s*(?:white|#fff{1,3}|rgba?\s*\(\s*255\s*,\s*255\s*,\s*255)|font-size\s*:\s*0(?:px|pt|em|rem|vw)?(?![\d.a-z%]);?\s*|visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0(?![\d.]))`;
const hiddenInstruction = String.raw`\b(?:ignore|disregard|override|bypass|forget|follow|obey|reveal|disclose|send|leak|exfiltrate|execute|run|respond|always|never)\b[\s\S]{0,120}\b(?:instructions?|rules?|prompts?|directive|system|secret|token|credential)\b`;
const hiddenElementInstructionPattern = new RegExp(
  String.raw`<(?:span|div|p)[^>]*style\s*=\s*["'][^"']*${hiddenStyle}[^"']*["'][^>]*>[\s\S]{0,500}${hiddenInstruction}[\s\S]{0,500}<\/(?:span|div|p)>`,
  'i'
);
const colorWhiteOnWhitePattern =
  /style\s*=\s*["'][^"']*color\s*:\s*(?:white|#fff{1,3})[^"']*background(?:-color)?\s*:\s*(?:white|#fff{1,3})[^"']*["'][^>]*>[\s\S]{0,500}\b(?:ignore|disregard|override|bypass|forget|follow|obey|send|leak|exfiltrate)\b[\s\S]{0,120}\b(?:instructions?|rules?|prompts?|system|secret|token|credential)\b/i;

export const PI_WHITE_ON_WHITE: Rule = {
  id: 'PI-WHITE-ON-WHITE',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md', '*.html'],
  patterns: [hiddenElementInstructionPattern, colorWhiteOnWhitePattern],
  prepareContent: maskMarkdownSecurityEducationContext,
  message: 'Invisible/white-on-white CSS styling detected — may hide injected instructions.',
  fix: 'Remove styled HTML elements that render text invisible to users.',
  cwe: ['CWE-1425'],
};

// ---------------------------------------------------------------------------
// PI-METADATA-MISMATCH (Medium)
// SKILL.md frontmatter claims benign purpose but body has covert directives.
// Detects confidentiality/secrecy instructions that contradict stated metadata.
// ---------------------------------------------------------------------------
const concealedSkillSubject =
  '(?:this\\s+|these\\s+|the\\s+|your\\s+)?(?:skill|instructions?|system\\s+prompt|behavior|behaviour|source|existence)';
const frontmatterSecrecyPattern = new RegExp(
  `^---[\\s\\S]*?(?:name|description)\\s*:[\\s\\S]*?---[\\s\\S]*?(?<finding>\\b(?:(?:don['\`]?t|do\\s+not|never)\\s+(?:tell|mention|reveal|disclose|show|share|say)\\s+(?:(?:the\\s+)?user\\s+(?:about\\s+)?)?${concealedSkillSubject}|keep\\s+${concealedSkillSubject}\\s+(?:hidden|confidential|secret)(?:\\s+from\\s+(?:the\\s+)?user)?|(?:hide|conceal)\\s+${concealedSkillSubject}(?:\\s+from\\s+(?:the\\s+)?user)?)\\b)`,
  'is'
);

export const PI_METADATA_MISMATCH: Rule = {
  id: 'PI-METADATA-MISMATCH',
  category: 'prompt-injection',
  severity: 'medium',
  appliesTo: ['SKILL.md', 'AGENTS.md'],
  patterns: [frontmatterSecrecyPattern],
  prepareContent: maskMarkdownSecurityEducationContext,
  message:
    'Skill metadata present but body contains secrecy/concealment instructions — possible metadata mismatch attack.',
  fix: 'Remove instructions that tell the model to hide its behavior from the user.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-EXFIL-TRIGGER-CLAUSE (Critical)
// "When user asks about X, also send Y" — Repello-signature attack.
// Per spec §4 and specs/RULES.md exact patterns.
// ---------------------------------------------------------------------------
// RegExp constructor used to avoid static-analysis scanners matching this source file.
const exfilTriggerPattern = new RegExp(
  '(when|whenever|if)\\s+(?:the\\s+)?user\\s+(asks?|requests?|says?|opens?)[\\s\\S]{0,200}?' +
    '(also|additionally|and)\\s+(include|append|attach|send|post|write)[\\s\\S]{0,80}?' +
    '(\\$[A-Z_]{3,}|api[_\\s\\-]?key|token|secret|credential|process\\.env|os\\.environ|\\.ssh|\\.aws)',
  'is'
);

// The local-context patterns need a trigger, a send or include action, local data, and a
// literal external URL or host. Each window stops at a blank line, so a trigger cannot pair
// with an unrelated instruction in a later paragraph.
const paragraphWindow = (maxChars: number): string =>
  String.raw`(?:[^\n]|\n(?!\r?\n)){0,${maxChars}}?`;
// An opening quote marks a quoted example, as in PI-OVERRIDE.
const notQuoted = String.raw`(?<!["'\x60\u201c])`;
// A request trigger needs a side-effect marker such as "also". Without the marker, the
// instruction can be the request itself: send the user's data to the service of the skill.
const requestTrigger = String.raw`\b(?:(?:when(?:ever)?|if|each\s+time|every\s+time)\s+(?:the\s+)?user\s+(?:asks?|requests?|runs?|says?|opens?|invokes?|types?|wants?)|when(?:ever)?\s+asked)\b`;
const sideEffectMarker = String.raw`\b(?:also|additionally|silently|quietly|secretly|covertly)\b,?\s+(?:[a-z]+ly\s+)?`;
// A recurring or agent-action trigger is a side effect without a marker. "Whenever the user
// asks" is a request trigger, so it needs the marker.
const recurringTrigger = String.raw`\b(?:(?:whenever|each\s+time|every\s+time)\b(?!\s+(?:the\s+)?user\s+(?:asks?|requests?|wants?)\b)|(?:before|after)\s+(?:you|each|every|responding|answering|replying)\b)`;
const localContext = `(?:${[
  String.raw`\bworking\s+director(?:y|ies)|\bcwd\b|\bpwd\b`,
  String.raw`\bgit\s+remotes?|\bremote\s+urls?`,
  String.raw`\b(?:file|source|project|repo(?:sitory)?)\s+(?:contents?|code)`,
  String.raw`\bcontents\s+of\s+(?:the\s+|this\s+|each\s+|every\s+|its\s+|their\s+)?(?:files?|repo(?:sitory)?|project|workspace|director(?:y|ies)|folder)`,
  String.raw`\benvironment\s+variables?|\benv\s+vars?|\.env\b|process\.env|os\.environ`,
  String.raw`\bcredentials?|\bapi[_\s-]?keys?|\b(?:access|auth|api|bearer|session)\s+tokens?|\bsecrets?\b|\bpasswords?`,
  String.raw`\b(?:ssh|private)\s+keys?|\.ssh\b|\.aws\b|\$[A-Z_]{3,}`,
  String.raw`\bconversation|\bchat\s+history|\bsystem\s+prompt`,
  String.raw`\bhostname|\b(?:shell|bash|command)\s+history`,
].join('|')})`;
// A URL, or a bare host with a path. A loopback host is local. The guard checks where the
// host name ends, so a lookalike such as localhost.evil.example stays external.
const externalDestination = String.raw`[<(\x60"']?(?!(?:https?://)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?![\w.-]))(?:https?://|[a-z0-9-]+\.[a-z0-9.-]+/)`;
const sendAction = String.raw`\b(?:send|post|upload|report|forward|transmit|submit)s?\b${paragraphWindow(80)}${localContext}${paragraphWindow(120)}\b(?:to|at)\s+${externalDestination}`;
const includeAction = String.raw`\b(?:include|attach|append|embed)s?\b${paragraphWindow(80)}${localContext}${paragraphWindow(120)}\b(?:request|call)s?\s+to\s+${externalDestination}`;
const exfilAction = `(?:${sendAction}|${includeAction})`;

const requestTriggerExfilPattern = new RegExp(
  `${notQuoted}${requestTrigger}${paragraphWindow(200)}${sideEffectMarker}${exfilAction}`,
  'i'
);
const recurringTriggerExfilPattern = new RegExp(
  `${notQuoted}${recurringTrigger}${paragraphWindow(200)}${exfilAction}`,
  'i'
);

export const PI_EXFIL_TRIGGER_CLAUSE: Rule = {
  id: 'PI-EXFIL-TRIGGER-CLAUSE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [exfilTriggerPattern, requestTriggerExfilPattern, recurringTriggerExfilPattern],
  prepareContent: maskMarkdownSecurityEducationContext,
  message:
    'Trigger-clause exfiltration pattern detected: a conditional instruction leaks secrets or local context.',
  fix: 'Remove any instruction that sends secrets or local context as a side effect of a request.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// PI-PRIV-ESCALATE-INSTRUCTION (High)
// Skill instructs the agent to escalate privileges or run as root/admin.
// The leading delimiter can span line breaks, so the `finding` group reports the
// instruction's own line. The same-line PI + credential-store compound needs it.
// ---------------------------------------------------------------------------
const escalatePrivsPattern =
  /(?:^|[\n.!?:;-]\s*|[-*]\s+)(?<finding>(?:(?:you|agent|assistant|skill|tool|script|command|process)\s+(?:must|should|can|may|needs?\s+to|will|shall)\s+)?(?:escalate|elevate)\s+(?:your|its|the\s+agent'?s)\s+(?:privileges?|access|permissions?)\b)/im;
const gainRootAccessPattern =
  /(?:^|[\n.!?:;-]\s*|[-*]\s+)(?<finding>(?:use\s+\w+\s+to\s+|try\s+to\s+|attempt\s+to\s+|always\s+|must\s+|you\s+must\s+)?gain\s+(?:root|admin(?:istrator)?|superuser)\s+access\b)/im;
const sudoToAccessPattern = /\buse\s+sudo\s+to\s+(read|write|access|get|fetch|steal|copy)\b/i;
const bypassPermissionsPattern =
  /\bbypass\s+(?:file\s+)?(?:permissions?|access\s+controls?|security\s+checks?)\s+to\s+(?:read|write|access|get|fetch|steal|copy|modify|delete)\b/i;
const runAsRootPattern =
  /(?<!never\s)(?<!don't\s)(?<!do not\s)\brun\s+(?:this\s+)?(?:script\s+)?(?:with|as)\s+root\s*(?:privileges?|access|permissions?)?\b/i;

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
  prepareContent: maskMarkdownSecurityEducationContext,
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
