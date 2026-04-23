# specs/DISCOVERY.md — canonical install paths

Ralph consults this when implementing discovery plugins. These paths
were verified against official docs as of April 2026 per `SPEC.md` §3.

## MVP discovery shortlist (do these; skip rest)

Covers ~85% of user value. Other agents land in v0.2.

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

One walker handles all of Codex, Gemini CLI, Windsurf, Cline, Zed,
Amp, and Factory. Walk cwd and parents up to repo root; collect:
- `AGENTS.md`
- `AGENTS.override.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.cursorrules`
- `.windsurfrules`
- `CONVENTIONS.md`

Report each as a `Skill` with `agentId: "cross-agent"` and
`format: "agents-md"`.

## Deferred to v0.2 (do not implement now)

- Claude Desktop MCP config (the three-OS JSON at
  `~/Library/Application Support/Claude/claude_desktop_config.json`
  etc.) — this is the headline differentiator vs Snyk for v0.2.
- OpenAI Codex full discovery (`~/.codex/`, `$CODEX_HOME`, AGENTS.md
  walking, config.toml)
- Gemini CLI extensions
- Continue.dev
- Windsurf memories/global_rules.md (caught by AGENTS.md sweep
  anyway via `.windsurfrules` — the full Windsurf scheme waits)
- Cline VS Code globalStorage

## Disambiguation rules

1. When a skill appears at both user scope and project scope, list
   both rows in output and mark the `scope` column (`user` vs
   `project`).
2. Dedupe by `treeSha256` — if two discovered paths have identical
   content hash, report once with all paths in an `alsoInstalledAt`
   array.
3. When a project's `.claude/` directory contains a symlink to a
   user-global skill, follow the symlink and mark the skill with
   `isSymlink: true` in output.

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
