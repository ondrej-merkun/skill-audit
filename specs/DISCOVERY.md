# specs/DISCOVERY.md — canonical install paths

Ralph consults this when implementing discovery plugins. These paths
were verified against official docs as of April 2026 per `SPEC.md` §3.
Cline paths were refreshed against official docs in May 2026.
Shared `.agents/skills` paths were verified against official docs in October 2026.
Hook and settings paths were verified against vendor docs in October 2026.

Hook and settings files run code, so they are scan targets with
`format: "agent-config"`. Home files have `scope: "user"`; working-directory
files have `scope: "project"`. Missing files are skipped.

## Implemented discovery set (keep this accurate)

Covers the high-value local install surfaces. When a new agent lands in code,
move it here in the same task; do not leave implemented behavior documented as
"deferred".

### 1. Claude Code

**User-global:**
- `~/.claude/skills/*/SKILL.md`
- `~/.claude/plugins/`, except `~/.claude/plugins/.trash/`. Claude Code moves
  the synced plugins that it removes there and never loads them again, so
  discovery always skips that subtree, also with `--include-marketplaces`.
- `~/.claude/commands/*.md`
- `~/.claude/agents/*.md`
- MCP servers in `~/.claude.json`, including the nested
  `projects.<absolute-path>.mcpServers` shape
- `~/.claude/settings.json` (hooks and command-valued settings)
- Installed plugin `hooks/hooks.json` and plugin `.mcp.json` servers, only at
  a plugin root. In a plugin with `.claude-plugin/plugin.json`, a copy deeper
  in the payload (such as a template for another agent) never loads and is
  skipped.
- Plugin scripts that a plugin hook names through `${CLAUDE_PLUGIN_ROOT}`

**Project-local (cwd + parents until repo root):**
- `.claude/skills/`
- `.claude/commands/`
- `.claude/agents/`
- `.claude/settings.json`, `.claude/settings.local.json`
- Project scripts that these hooks name through `$CLAUDE_PROJECT_DIR` or by a
  path relative to the project root
- `.mcp.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

Each MCP server entry is scanned with only its own definition, rendered as a
one-server `.mcp.json` document. Findings stay on that server, line numbers
count from the start of that document, and rules never read or quote other
parts of a shared file such as `~/.claude.json`.

A hook script is a separate `agent-config` target with the scope of its
settings or hooks file. It is reported only when the script exists below the
project root or the plugin root, also after symlinks are resolved. Discovery
follows literal paths in a command word; quoted words keep their spaces.
Paths that the shell builds at run time are not followed. Scripts that user
settings name are the user's
own and are not followed. Hook scripts of the other agents are not followed
yet.

**Manifest formats:** `SKILL.md` (YAML front matter + markdown body),
`plugin.json`, `.mcp.json`.

### 2. Cursor

**User-global:**
- `~/.cursor/mcp.json`
- `~/.cursor/rules/`
- `~/.cursor/hooks.json`

**Project-local:**
- `.cursor/mcp.json`
- `.cursor/rules/*.mdc`
- `.cursor/hooks.json`
- Legacy: `.cursorrules` (single file at repo root)

### 3. GitHub Copilot

**User-global:**
- `~/.copilot/skills/*/SKILL.md`
- Also read `~/.claude/skills/` (Copilot reads Claude skills)
- Also read `~/.agents/skills/`
- `~/.copilot/hooks/*.json` (each file is scanned as `hooks.json`)
- `~/.copilot/settings.json` (inline `hooks`)

**Project-local:**
- `.github/skills/*/SKILL.md`
- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`
- `.github/hooks/*.json` (each file is scanned as `hooks.json`)
- `.github/copilot/settings.json`, `.github/copilot/settings.local.json`
  (inline `hooks`)

### 4. Cline

**User-global:**
- `~/Documents/Cline/Rules/*.md`
- `~/Documents/Cline/Rules/*.txt`
- `~/Cline/Rules/` fallback on Linux/WSL
- `~/.cline/skills/*/SKILL.md`
- `~/Documents/Cline/Workflows/*.md`
- `~/.cline/data/settings/cline_mcp_settings.json`
- `$CLINE_DIR/data/settings/cline_mcp_settings.json`
- VS Code / VS Code Insiders / JetBrains extension storage under
  `globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Project-local:**
- `.clinerules` legacy file
- `.clinerules/*.md`
- `.clinerules/*.txt`
- `.cline/skills/*/SKILL.md`
- `.clinerules/skills/*/SKILL.md`
- `.clinerules/workflows/*.md`

**Manifest formats:** `SKILL.md`, Markdown/TXT rules, Markdown workflows,
`cline_mcp_settings.json`.

Cline hook directories (`~/.cline/hooks/`, `~/Documents/Cline/Hooks/`,
`.cline/hooks/`, `.clinerules/hooks/`) are not scanned yet: the current Cline
docs do not define the hook file format.

### 5. Cross-agent AGENTS.md sweep

One walker handles shared project instruction files for Codex, Gemini CLI,
Windsurf, Cline, Zed, Amp, and Factory. Walk cwd and parents up to repo root;
collect:
- `AGENTS.md`
- `AGENTS.override.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.cursorrules`
- `.windsurfrules`
- `CONVENTIONS.md`

Report each as a `Skill` with `agentId: "cross-agent"` and
`format: "agents-md"`.

### 6. OpenAI Codex

**User-global:**
- `~/.codex/AGENTS.md`
- `~/.codex/AGENTS.override.md`
- `~/.codex/config.toml` (`[mcp_servers.*]` only)
- `~/.codex/skills/**/SKILL.md`
- `~/.codex/prompts/*.md`
- `~/.codex/hooks.json`
- `$CODEX_HOME` override for all user-global Codex paths

**Project-local:**
- `AGENTS.md` / `AGENTS.override.md` are handled by the cross-agent sweep.
- `.codex/config.toml` may be emitted as untrusted project config.
- `.codex/hooks.json`

**Plugin cache rule:**
- Do not scan `~/.codex/plugins/cache` wholesale. Cache payloads are only scan
  targets when Codex metadata proves they are enabled/exposed to the agent, for
  example an enabled `[plugins."<plugin>@<marketplace>"]` entry in
  `~/.codex/config.toml`, or a documented built-in runtime exposure source.
- A cache entry with no active metadata is inventory, not an installed skill.
- When a cache entry is active, walk it recursively and emit prompt-bearing
  leaves (`SKILL.md`, command/agent files) rather than intermediate cache
  directories.

### 7. Gemini CLI

**User-global:**
- `~/.gemini/extensions/**/gemini-extension.json`
- `~/.gemini/commands/**/*.toml`
- `~/.gemini/agents/**/*.md`
- `~/.gemini/settings.json` (hooks, plus one entry per `mcpServers` server).
  Each server entry scans the server's definition as the file writes it, so
  rules that read lines see the same layout as in the file. The settings file
  target scans the file without its servers, so a risky server is reported
  once, on its own entry. Findings in the rest of the file keep their real
  lines. Hook findings and server findings are on different entries, so they
  do not combine into a compound trigger such as `FS-CREDSTORE` + `NET-*`.
  When `JSON.parse` drops a server definition (a duplicate server name or a
  second `mcpServers` key), that definition has no entry of its own. Then the
  settings file target scans the whole file, and each server entry scans its
  parsed definition.

**Project-local:**
- `.gemini/extensions/`
- `.gemini/commands/`
- `.gemini/settings.json` (hooks)
- `GEMINI.md` is handled by the cross-agent sweep.

### 7. Windsurf

**User-global:**
- `~/.codeium/windsurf/memories/global_rules.md`
- `~/.codeium/windsurf/hooks.json`, and `~/.codeium/hooks.json` for the
  JetBrains plugin

**Project-local:**
- `.windsurf/rules/*.md` in the current workspace
- Nested workspace `.windsurf/rules/*.md` directories
- Parent `.windsurf/rules/*.md` directories up to the git root
- Legacy `.windsurfrules`
- `.devin/hooks.json`, and the legacy `.windsurf/hooks.json`
- `AGENTS.md` is handled by the cross-agent sweep.

### 8. Shared Agent Skills directory

OpenAI Codex, Cursor, GitHub Copilot, Gemini CLI, Windsurf, and Cline read the
cross-agent `.agents/skills` directory. Claude Code does not.

**User-global:** `~/.agents/skills/**/SKILL.md`

**Project-local:** `.agents/skills/**/SKILL.md` in the current directory

Every directory that holds a `SKILL.md` is one skill, at any depth and with
the skills root itself included. Codex and Cursor load skills nested under
grouping directories, and Gemini CLI loads a root `SKILL.md`. The walk has no
depth limit and does not skip hidden directories, because the rule engine
scans each `SKILL.md` directory as its own root.

One shared walker emits these skills once for each of those agents that is
installed. `discoverAll()` then collapses the identical rows into one skill
that keeps every owning agent. Not scanned yet: Codex parent directories up to
the repo root and `/etc/codex/skills`, and Cursor nested project directories.


## Disambiguation rules

1. When a skill appears at both user scope and project scope, list
   both rows in output and mark the `scope` column (`user` vs
   `project`).
2. Dedupe by `treeSha256` — if two discovered paths have identical
   content hash, report once and preserve the agent-to-path mapping on
   the normalized skill. This is a registry-level invariant owned by
   `discoverAll()`, because duplicates can come from different agents/plugins.
   Do not dedupe entries whose `treeSha256` is empty; those are synthetic
   config-derived scan targets such as individual MCP servers.
3. When a project's `.claude/` directory contains a symlink to a
   user-global skill, follow the symlink and mark the skill with
   `isSymlink: true` in output.
4. Plugin marketplace inventory is inactive by default. Any path whose
   normalized segments contain adjacent `plugins` and `marketplaces`
   segments is locally available marketplace payload, not an installed
   or exposed skill. Default discovery must prune those subtrees before
   reading prompt-bearing files and must filter any marketplace path an
   individual plugin still emits. Callers may opt in to include these
   skills; included rows carry `installState: "marketplace"`. All other
   discovered skills default to `installState: "installed"`.
5. Follow symlinks to directories and files in every discovery walker,
   in `treeSha256`, and in the rule engine. `npx skills` and skillshare
   install skills as links (for example `~/.claude/skills/<name>` into
   `~/.agents/skills/<name>`), and agents load the link target. A
   symlinked skill is discovered and scanned like a real one, under its
   link path, and hashes like a real copy, so rule 2 collapses it with
   its target. Each walk enters a real directory once, so a symlink
   loop (`a -> a`) ends. A link to an ancestor of the walk root (`/`,
   `~`, `..`) counts as a loop and is not walked. A second link to an
   already walked directory in the same walk is skipped. Dangling links
   and unreadable linked directories are skipped silently, and the rest
   of the skill is still scanned. The rule engine demotes a file to inert
   supporting docs only when every known path to it is an unreferenced
   docs path: the walked path and each path through a skipped second
   link (with `docs -> payload` or `payload -> docs`, the file is also
   at `payload/`, so it stays operative). For the same reason, rules
   prepare a file under a known path that does not look like docs, so
   `docs -> scripts` cannot mask `scripts/setup.sh`. Each skipped second
   link also goes into `treeSha256`, so two copies that differ only by
   such a link do not collapse under rule 2.

## Path expansion

- `~` expands to `os.homedir()` on all platforms.
- On Windows, also check `%APPDATA%\Claude\` alongside `~/.claude/`
  (Claude Code uses `%APPDATA%` on Windows per Anthropic docs).
- Respect `XDG_CONFIG_HOME` if set (rare but some users have it).

## Permissions

- Skip any path that fails `fs.access(path, R_OK)`. Log a `warn`-level
  line to stderr but do not fail the whole scan.
- Follow symlinks that resolve outside the user's home dir too. The agent
  reads the link target, so a refused link would hide a payload (for
  example `scripts -> /tmp/payload`) from the scan. The scan can only
  read files that the current user can read.

## Tests

Each discovery plugin must have tests that:
1. Run against a temp directory (not the real home dir) via a mock
   `HOME` / `USERPROFILE` env var override.
2. Have fixtures under `test/fixtures/discovery/<agent>/` that include:
   - A minimal correct skill tree that should be discovered.
   - A skill tree with a missing manifest (should be skipped).
   - A symlinked skill tree (should be discovered) and a symlink loop
     (the walk should end).
   - Both user-scope and project-scope placements where applicable.
3. Include registry-level tests for cross-plugin invariants:
   - Duplicate non-empty `treeSha256` values collapse into one skill.
   - Duplicate agent/path ownership is preserved on the collapsed skill.
   - Empty `treeSha256` entries are not deduped.
4. For plugin cache discovery, include fixtures for active and inactive
   cache entries. Inactive cache-only payloads must not be scan targets.
