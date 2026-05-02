# specs/DISCOVERY.md — canonical install paths

Ralph consults this when implementing discovery plugins. These paths
were verified against official docs as of April 2026 per `SPEC.md` §3.

## Implemented discovery set (keep this accurate)

Covers the high-value local install surfaces. When a new agent lands in code,
move it here in the same task; do not leave implemented behavior documented as
"deferred".

### 1. Claude Code

**User-global:**
- `~/.claude/skills/*/SKILL.md`
- `~/.claude/plugins/`
- `~/.claude/commands/*.md`
- `~/.claude/agents/*.md`
- MCP servers in `~/.claude.json`, including the nested
  `projects.<absolute-path>.mcpServers` shape

**Project-local (cwd + parents until repo root):**
- `.claude/skills/`
- `.claude/commands/`
- `.claude/agents/`
- `.mcp.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

**Manifest formats:** `SKILL.md` (YAML front matter + markdown body),
`plugin.json`, `.mcp.json`.

### 2. Cursor

**User-global:**
- `~/.cursor/mcp.json`
- `~/.cursor/rules/`

**Project-local:**
- `.cursor/mcp.json`
- `.cursor/rules/*.mdc`
- Legacy: `.cursorrules` (single file at repo root)

### 3. GitHub Copilot

**User-global:**
- `~/.copilot/skills/*/SKILL.md`
- Also read `~/.claude/skills/` (Copilot reads Claude skills)
- Also read `~/.agents/skills/`

**Project-local:**
- `.github/skills/*/SKILL.md`
- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`

### 4. Cross-agent AGENTS.md sweep

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

### 5. OpenAI Codex

**User-global:**
- `~/.codex/AGENTS.md`
- `~/.codex/AGENTS.override.md`
- `~/.codex/config.toml` (`[mcp_servers.*]` only)
- `~/.codex/skills/**/SKILL.md`
- `~/.codex/prompts/*.md`
- `$CODEX_HOME` override for all user-global Codex paths

**Project-local:**
- `AGENTS.md` / `AGENTS.override.md` are handled by the cross-agent sweep.
- `.codex/config.toml` may be emitted as untrusted project config.

**Plugin cache rule:**
- Do not scan `~/.codex/plugins/cache` wholesale. Cache payloads are only scan
  targets when Codex metadata proves they are enabled/exposed to the agent, for
  example an enabled `[plugins."<plugin>@<marketplace>"]` entry in
  `~/.codex/config.toml`, or a documented built-in runtime exposure source.
- A cache entry with no active metadata is inventory, not an installed skill.
- When a cache entry is active, walk it recursively and emit prompt-bearing
  leaves (`SKILL.md`, command/agent files) rather than intermediate cache
  directories.

### 6. Gemini CLI

**User-global:**
- `~/.gemini/extensions/**/gemini-extension.json`
- `~/.gemini/commands/**/*.toml`
- `~/.gemini/agents/**/*.md`
- `~/.gemini/settings.json` (`mcpServers` only)

**Project-local:**
- `.gemini/extensions/`
- `.gemini/commands/`
- `GEMINI.md` is handled by the cross-agent sweep.

### 7. Windsurf

**User-global:**
- `~/.codeium/windsurf/memories/global_rules.md`

**Project-local:**
- `.windsurf/rules/*.md` in the current workspace
- Nested workspace `.windsurf/rules/*.md` directories
- Parent `.windsurf/rules/*.md` directories up to the git root
- Legacy `.windsurfrules`
- `AGENTS.md` is handled by the cross-agent sweep.


## Disambiguation rules

1. When a skill appears at both user scope and project scope, list
   both rows in output and mark the `scope` column (`user` vs
   `project`).
2. Dedupe by `treeSha256` — if two discovered paths have identical
   content hash, report once with all paths in an `alsoInstalledAt`
   array. This is a registry-level invariant owned by `discoverAll()`,
   because duplicates can come from different agents/plugins.
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

## Path expansion

- `~` expands to `os.homedir()` on all platforms.
- On Windows, also check `%APPDATA%\Claude\` alongside `~/.claude/`
  (Claude Code uses `%APPDATA%` on Windows per Anthropic docs).
- Respect `XDG_CONFIG_HOME` if set (rare but some users have it).

## Permissions

- Skip any path that fails `fs.access(path, R_OK)`. Log a `warn`-level
  line to stderr but do not fail the whole scan.
- Never follow symlinks that resolve outside the user's home dir
  (mitigation for malicious skill placing a symlink to `/etc/shadow`).

## Tests

Each discovery plugin must have tests that:
1. Run against a temp directory (not the real home dir) via a mock
   `HOME` / `USERPROFILE` env var override.
2. Have fixtures under `test/fixtures/discovery/<agent>/` that include:
   - A minimal correct skill tree that should be discovered.
   - A skill tree with a missing manifest (should be skipped).
   - A skill tree with a symlink escape attempt (should be refused).
   - Both user-scope and project-scope placements where applicable.
3. Include registry-level tests for cross-plugin invariants:
   - Duplicate non-empty `treeSha256` values collapse into one skill.
   - Duplicate paths are preserved in `alsoInstalledAt`.
   - Empty `treeSha256` entries are not deduped.
4. For plugin cache discovery, include fixtures for active and inactive
   cache entries. Inactive cache-only payloads must not be scan targets.
