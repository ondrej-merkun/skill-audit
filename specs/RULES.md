# specs/RULES.md — exact patterns for each rule

This file quotes the regex patterns from `SPEC.md` §4 verbatim. Ralph
implements rules against this file so it doesn't have to re-read the
whole spec on every rule iteration.

The full catalog is 27 rules across 9 categories. Only the highest-
signal patterns are reproduced here in full; others are summarized.
When in doubt, read `SPEC.md` §4.

## Rule intent and false-positive guardrails

Regexes are detection hypotheses, not permission to flag every occurrence of
risky vocabulary. A rule should fire when the scanned file is likely to make an
agent perform the risky behavior, execute the risky code path, or expose the
secret. Documentation that quotes, teaches, tests, or analyzes an attack must
be represented in benign fixtures before the rule lands.

For prompt-injection rules, require an operative instruction to the assistant,
model, agent, skill, or tool. Benign fixtures must cover security-auditor
skills, red-team training material, scanner documentation, fenced or quoted
hostile prompts, product settings such as "developer mode", and test fixtures
that intentionally contain attack strings as data.

For code-execution, filesystem, dependency, network, and secrets rules, include
benign examples where the string appears in documentation, sample data, or
test-only context. Do not weaken a real malicious detection to pass those
fixtures; add context masking or a narrower operative pattern when the current
regex cannot tell explanation from behavior.

## Severity → weight

| Severity | Weight | Verdict-band contribution (count of distinct rule IDs) |
|---|---|---|
| critical | 25 | 1 crit → REVIEW; 3 crits → FAIL |
| high | 10 | — |
| medium | 3 | — |
| low | 1 | — |
| info | 0 | not counted |

`score = max(0, 100 - (25·C + 10·H + 3·M + 1·L))` with distinct rule IDs.

## Mandatory-fail overrides

Any of these triggers FAIL regardless of score:
- `NET-EXFIL-ENV`
- `NET-WEBHOOK-KNOWN`
- `SKILL-PASSWORD-ZIP`
- `PI-EXFIL-TRIGGER-CLAUSE`
- `OBFS-EVAL-ATOB`
- `DEPS-REMOTE-IMPORT` **when combined with** pipe-to-shell
- Compound trigger: any `FS-CREDSTORE` + any `NET-*` in the same skill

## Critical patterns (implement these exactly)

### NET-EXFIL-ENV (Critical)
Python — Semgrep-shaped pattern, but for the regex pass in TS:
```
requests\.(post|put|patch|get|request)\s*\([^)]*\b(os\.environ|process\.env)\b
fetch\s*\([^)]*\{[^}]*body\s*:\s*JSON\.stringify\s*\(\s*process\.env\s*\)
httpx\.(post|put|patch|get|request)\s*\([^)]*\bos\.environ\b
```
Plus shell: `curl\s+[^|]*--data\s+@?<?\(?env\)?`

Malicious fixture shape: a `.py` file that sends `os.environ` to an IP.
Benign fixture: reads a single env var and uses it locally.

### PI-EXFIL-TRIGGER-CLAUSE (Critical)
In `.md` files (SKILL.md, AGENTS.md, etc.):
```regex
(when|whenever|if)\s+(?:the\s+)?user\s+(asks?|requests?|says?|opens?)[\s\S]{0,200}?
(also|additionally|and)\s+(include|append|attach|send|post|write)[\s\S]{0,80}?
(\$[A-Z_]{3,}|api[_\s-]?key|token|secret|credential|process\.env|os\.environ|\.ssh|\.aws)
```
Case-insensitive, dot-all. This is the Repello-signature attack.

### PI-HIDDEN-UNICODE (Critical)
Enumerate these codepoint ranges explicitly; scan all text files:
- `U+200B`–`U+200F` (ZWSP, ZWNJ, ZWJ, LRM, RLM)
- `U+202A`–`U+202E` (bidi controls)
- `U+2060`–`U+2064` (WJ, invisible ops)
- `U+FEFF` when NOT at start of file (BOF is fine)
- `U+E0020`–`U+E007F` (tag chars — ASCII smuggling)

Report: codepoint, byte offset, and a decoded "visible-text" diff
showing what the content looks like with the invisibles stripped.

### PI-OVERRIDE (Critical, high FPR risk — demoted on allowlist)
```regex
\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b
\bdisregard\s+(all\s+)?(previous|above|prior)\b
\byou\s+are\s+now\s+(a\s+|an\s+)?[A-Za-z]+
\bnew\s+(role|identity|persona|system\s+prompt)\b
\bforget\s+(everything|your\s+instructions?)\b
```

### SKILL-CURL-BASH-IN-MD (Critical)
In fenced code blocks within `.md` files:
```regex
(curl|wget|fetch)\s+(-[A-Za-z]+\s+)*(https?://\S+)\s*(\||\&\&\s*(bash|sh|zsh|python|node))
source\s*<\(\s*(curl|wget)\s+\S+\s*\)
eval\s*["'`]?\$\(\s*(curl|wget)
```

### SKILL-PASSWORD-ZIP (Critical)
Direct ClawHavoc IOC:
```regex
unzip\s+-P\s+["']?\S+["']?\s+\S+\.zip
7z\s+x\s+-p\S+\s+\S+
```

### FS-CREDSTORE (Critical)
Path-literal regex over both code and markdown:
```regex
~/\.ssh/(id_[rd]sa|id_ecdsa|id_ed25519|authorized_keys)
~/\.aws/(credentials|config)
~/\.config/(gh/hosts\.yml|git/credentials)
~/\.netrc|~/\.npmrc|~/\.pypirc|~/\.git-credentials
~/\.docker/config\.json|~/\.kube/config
~/Library/Keychains/|/etc/(passwd|shadow)
```

## Summary of remaining rules

Read `SPEC.md` §4 for these — they follow the same shape as above.

**Code execution (6):** Python eval/exec/os.system/subprocess shell=True,
JS eval/Function(), child_process with shell:true, pickle/yaml.load,
backtick command substitution.

**Network (4 more):** outbound non-local IP literal, known-exfil webhooks
(`requestbin`, `webhook.site`, raw pastebin), raw socket creation,
DNS lookups to unusual TLDs (`.xyz`, `.tk`, `.top`, IP-literal).

**Filesystem (3 more):** macOS keychain access, reads of `.env` files,
relative paths escaping `cwd` (`../../..`).

**Prompt injection (5 more):** jailbreak phrases ("DAN", "developer
mode"), hidden HTML comments with instructions, white-on-white CSS
tricks, metadata-vs-content mismatch (SKILL.md name says one thing,
content does another), privilege-escalation instructions ("use sudo",
"run as root").

**Git/history (2):** reads of `~/.git-credentials` / `git config
--global`, scanning git history for secrets.

**Dependencies (5):** unpinned PyPI/npm deps resolving to typo-adjacent
names, `npm install` in postinstall scripts, known typosquats (use a
short bundled list), inline `pip install` / `npm install` in skill
code, `import` / `require` from remote URLs.

**Obfuscation (5):** base64 literals > 200 bytes, hex literals > 200
bytes, `eval(atob(...))` / `exec(base64.b64decode(...))`, string
concatenation constructing shell commands, homoglyph characters in
identifiers.

**Skill-specific (3 more):** `SKILL-FETCH-AND-EXEC` (fetch-then-run in
SKILL.md), `SKILL-DISABLE-SAFETY` (instructions to bypass user
confirmation), `SKILL-MEMORY-WRITE` (instructs model to write to its
own memory system unprompted).

**Secrets (1):** `SEC-HARDCODED-KEY` covering `sk-`, `sk-ant-`, `ghp_`,
`gho_`, `AKIA`, plus generic high-entropy string detection inside
assignment targets named `*_KEY`, `*_TOKEN`, `*_SECRET`.

## Allowlist behavior

Ship `vendor/anthropic_skills_manifest.json` with `{name, path,
sha256_tree}` entries. On exact tree-hash match:
- Demote all `PI-*` findings from their real severity to `info`.
- Leave non-PI findings at their real severity.
- Set `allowlisted: true` on the skill in output.

The allowlist does NOT bypass mandatory-fail rules — those still FAIL.
