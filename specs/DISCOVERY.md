# specs/DISCOVERY.md — canonical install paths

Ralph consults this when implementing discovery plugins. These paths
were verified against official docs as of April 2026 per `SPEC.md` §3.
Cline paths were refreshed against official docs in May 2026.
Shared `.agents/skills` paths were verified against official docs in October 2026.
Hook and settings paths were verified against vendor docs in October 2026.
Cursor skills, subagent, and plugin paths were verified against the Cursor docs
in October 2026.
Claude Code plugin install records and `enabledPlugins` were verified against
vendor docs in October 2026.
OpenCode, Amp, and OpenClaw paths were verified against official docs in October 2026.

Claude Code memory, rule, and parent-directory paths were verified against the
Claude Code docs and the loader in Claude Code 2.1.314 in October 2026.

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
- `~/.claude/plugins/`, except `~/.claude/plugins/.trash/` and
  `~/.claude/plugins/cache/`. Claude Code moves the synced plugins that it
  removes to `.trash` and never loads them again. Discovery always skips both
  subtrees, also with `--include-marketplaces`.
- Enabled plugin installs in `~/.claude/plugins/cache/`. See the plugin cache
  rule below.
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
- `~/.claude/CLAUDE.md` (user memory)
- `~/.claude/rules/**/*.md` (user rules, at any depth)

**Project-local, cwd and each parent up to the git root:**
- `.claude/skills/`
- `.claude/commands/`
- `.claude/agents/`

A linked worktree marks its root with a `.git` file, so the walk stops there.
Without a git root, the walk continues to the filesystem root. The parent walk
stops below home, because `~/.claude/` holds the user files.

**Project-local, cwd and every parent up to the filesystem root:**
- `.claude/CLAUDE.md`, `.claude/AGENTS.md`, `CLAUDE.local.md` (memory files)
- `.claude/rules/**/*.md` (rules, at any depth)

Claude Code loads these files at launch also above the repository root. The
root `CLAUDE.md` and `AGENTS.md` come from the cross-agent sweep (section 5).
When cwd is below home, the walk also finds `~/.claude/CLAUDE.md` and
`~/.claude/rules/` as project files. Dedupe collapses them with the user rows.

**Project-local, cwd only:**
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

Memory and rule files are `agents-md` targets. A memory file keeps its file
name as the skill name. A rule or command file drops the `.md` extension.

Not scanned yet: the managed `CLAUDE.md` and managed `.claude/rules/` in the
system policy directory, auto memory (`~/.claude/projects/<project>/memory/`),
files that a memory file imports with `@path`, memory files, rules, and skills
in subdirectories below cwd (Claude Code loads them on demand), the main
checkout's skills that a linked worktree without `.claude/skills/` loads, and
`--add-dir` directories.

**Manifest formats:** `SKILL.md` (YAML front matter + markdown body),
`plugin.json`, `.mcp.json`.

**Plugin cache rule** (verified against the Claude Code
[plugin loading reference](https://code.claude.com/docs/en/plugins/loading.md)
and the [`enabledPlugins` setting](https://code.claude.com/docs/en/settings-reference.md#enabledplugins)
in October 2026):
- Claude Code loads a marketplace plugin only from the `installPath` of its
  record in `~/.claude/plugins/installed_plugins.json`, in
  `cache/<marketplace>/<plugin>/<version>/`. Other cache dirs, such as the
  previous version that Claude Code keeps for 14 days after an update, are
  inventory and are not scan targets, also with `--include-marketplaces`.
- A record is active when its plugin is enabled. `enabledPlugins` maps
  `<plugin>@<marketplace>` to `true` or `false`. The user
  (`~/.claude/settings.json`), project (`.claude/settings.json`), and local
  (`.claude/settings.local.json`) values merge key by key, and a later file
  wins for each plugin id that it names. A plugin that no file names is
  enabled.
- A `user` record uses the working directory's project and local settings. A
  `project` or `local` record uses the settings of its `projectPath`. A
  `managed` record is always active: managed settings installed it and turn it
  on.
- Discovery does not read managed settings sources (remote, MDM, registry, or
  `managed-settings.json`). A managed `false` can therefore leave a blocked
  plugin in the scan. A managed `true` on a plugin that has only a `user`,
  `project`, or `local` record, which those settings turn off, is not seen, so
  that payload is not scanned.
- Discovery does not read the manifest `defaultEnabled` value, so a plugin
  that turns itself off by default is still scanned.
- A record whose `installPath` is outside `~/.claude/plugins/cache/` is
  ignored. A missing or unreadable `installed_plugins.json` means that no
  cached plugin is active, as in Claude Code.

### 2. Cursor

**User-global:**
- `~/.cursor/mcp.json`
- `~/.cursor/rules/`
- `~/.cursor/hooks.json`
- `~/.cursor/skills/**/SKILL.md`
- `~/.cursor/agents/**/*.md` subagents (also `.mdc` and `.markdown`)
- Plugins in `~/.cursor/plugins/local/<plugin>/`

**Project-local:**
- `.cursor/mcp.json`
- `.cursor/rules/*.mdc`
- `.cursor/hooks.json`
- `.cursor/skills/**/SKILL.md`
- `.cursor/agents/**/*.md` subagents (also `.mdc` and `.markdown`)
- Legacy: `.cursorrules` (single file at repo root)

**Plugin rule:**
- Cursor loads every plugin in `~/.cursor/plugins/local/` after a reload,
  unless an Enterprise admin turns off local plugin imports. A symlinked
  plugin loads only when its target is inside that folder, so discovery
  skips the other links. A folder without a manifest is not a plugin.
- Do not scan `~/.cursor/plugins/cache/`. Marketplace installs land there,
  but Cursor keeps no install or enable record next to them, so the cache is
  inventory. `~/.cursor/plugins/marketplaces/` is marketplace inventory too.
- A Cursor Plugin has `.cursor-plugin/plugin.json`. Each component comes from
  the paths in the manifest field (`skills`, `rules`, `agents`, `commands`,
  `hooks`, `mcpServers`), or from its default location when the field is
  absent: `skills/`, `rules/`, `agents/`, `commands/`, `hooks/hooks.json`,
  `mcp.json`. A manifest path replaces the default location. A root
  `SKILL.md` is a single-skill plugin when there is no `skills/` dir and no
  `skills` field.
- An Agent Plugin (the open standard) has a root `plugin.json` and loads only
  `skills/` and a root `mcp.json`.
- In both formats, a skills path is a skill when it holds a `SKILL.md`, and so
  is each dir directly inside it that holds one. A deeper `SKILL.md`, such as
  an example inside a skill, is not a loaded skill.
- A plugin hooks file is scanned as `hooks.json`, whatever its name. Its
  scripts below the plugin root are scan targets too, named through
  `${CURSOR_PLUGIN_ROOT}` or by a path relative to the plugin root. Inline
  `hooks` or `mcpServers` objects in the manifest make the manifest a
  hooks-file target.
- Each plugin MCP server is one entry, named `plugin-<plugin>-<server>` as
  Cursor shows it, and scanned with only its own definition.
- Command files (`.md`, `.mdc`, `.markdown`, `.txt`) are one-file skills.
  `.markdown` and `.txt` files get a `.md` scan name, so the markdown rules
  apply.

Not scanned yet: the Claude and Codex compatibility dirs that Cursor also
reads (`.claude/skills`, `.codex/skills`, `.claude/agents`, `.codex/agents`
and their home copies; the Claude Code and Codex plugins report most of
them), `.cursor/skills` dirs nested deeper in the project, and the
undocumented built-in skills in `~/.cursor/skills-cursor/`.

### 3. GitHub Copilot

**User-global:**
- `~/.copilot/skills/*/SKILL.md`
- Also read `~/.claude/skills/` (Copilot reads Claude skills)
- Also read `~/.agents/skills/`
- `~/.copilot/copilot-instructions.md`
- `~/.copilot/instructions/**/*.instructions.md`
- `~/.copilot/agents/**/*.md` (custom agents, `.agent.md` or `.md`)
- `~/.copilot/mcp-config.json` (`mcpServers`, one target per server)
- `~/.copilot/hooks/*.json` (each file is scanned as `hooks.json`)
- `~/.copilot/settings.json` (inline `hooks`)

**Project-local:**
- `.github/skills/*/SKILL.md`
- `.github/copilot-instructions.md`
- `.github/instructions/**/*.instructions.md`
- `.github/prompts/**/*.prompt.md` (prompt files)
- `.github/agents/**/*.md` (custom agents, `.agent.md` or `.md`)
- `.github/mcp.json` (`mcpServers`, or servers at the top level; one target
  per server)
- `.vscode/mcp.json` (VS Code `servers`; comments and trailing commas are
  valid; one target per server)
- `.github/hooks/*.json` (each file is scanned as `hooks.json`)
- `.github/copilot/settings.json`, `.github/copilot/settings.local.json`
  (inline `hooks`)

Instruction, prompt, and agent folders are walked at any depth. A file in a
subfolder is named by its relative path without the suffix, such as
`frontend/react`. Each MCP server is scanned with only its own definition, as
a one-server `.mcp.json` document.

Not covered yet:
- Copilot CLI also reads `.mcp.json`. Claude Code discovery reports its
  `mcpServers`. MCP entries do not dedupe across agents, so Copilot does not
  report them again. With `--agent copilot` or without Claude Code, they are
  not scanned.
- VS Code keeps user prompt files and the user `mcp.json` in its profile
  storage, which has no documented fixed path.

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
Windsurf, Cline, OpenCode, Zed, Amp, and Factory. Walk cwd and parents up to
repo root; collect:
- `AGENTS.md`
- `AGENTS.override.md`
- `AGENT.md` (Amp reads it when a directory has no `AGENTS.md`)
- `CLAUDE.md`
- `GEMINI.md`
- `.cursorrules`
- `.windsurfrules`
- `CONVENTIONS.md`

Report each as a `Skill` with `agentId: "cross-agent"` and
`format: "agents-md"`.

Claude Code-only memory files (`CLAUDE.local.md`, `.claude/CLAUDE.md`,
`.claude/AGENTS.md`) and `.claude/rules/` belong to the Claude Code plugin
(section 1), so `--agent claude-code` scans them.

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
- Skip `~/.codex/plugins/.remote-plugin-install-staging/` and
  `~/.codex/plugins/.marketplace-plugin-source-staging/`, also with
  `--include-marketplaces`. Codex extracts a plugin into a temp dir there
  (`remote-plugin-bundle-*`, `marketplace-plugin-source-*`) and then installs
  a copy into `cache`. A temp dir that an interrupted install leaves behind is
  never loaded. Verified against the Codex source
  (`codex-rs/core-plugins/src/remote_bundle.rs`, `npm_source.rs`, and
  `loader.rs`) in October 2026. A dir of the same name inside a plugin is
  still walked.

### 7. Gemini CLI

**User-global:**
- `~/.gemini/extensions/**/gemini-extension.json`
- `~/.gemini/commands/**/*.toml`
- `~/.gemini/agents/**/*.md`
- `~/.gemini/skills/**/SKILL.md`. Every directory that holds a `SKILL.md` is
  one skill, as in the shared `.agents/skills` walk (section 8). Gemini CLI
  loads `SKILL.md` and `*/SKILL.md` from this root.
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
- `.gemini/skills/**/SKILL.md`, walked as `~/.gemini/skills`.
- `.gemini/settings.json` (hooks, plus one entry per `mcpServers` server).
  The servers and the rest of the file split as in `~/.gemini/settings.json`.
  `gemini mcp add` writes a server to this file by default.
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

OpenAI Codex, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Cline, OpenCode,
and Amp read the cross-agent `.agents/skills` directory. OpenClaw reads only
`~/.agents/skills`, with its default state directory. Claude Code does not.

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
OpenCode and Amp also read `.agents/skills` in the parents up to the git root;
their own plugins emit those rows.

### 9. OpenCode

`<config>` is `$XDG_CONFIG_HOME/opencode`, or `~/.config/opencode`. OpenCode
counts as installed when `<config>` or its data directory
(`~/.local/share/opencode`) exists.

**User-global:**
- `<config>/opencode.json`, `<config>/opencode.jsonc` (one entry per MCP server)
- Local plugin files that the `plugin` list of `opencode.json(c)` or
  `tui.json(c)` names by path (`./`, `../`, `/`, `~/`, or `file://`). A
  relative path resolves against the directory of the config file.
- `<config>/AGENTS.md`
- `<config>/agents/`, `agent/`, `modes/`, `mode/`: `**/*.md`
- `<config>/commands/`, `command/`: `**/*.md`. A command body can run a shell
  command with !`cmd`.
- `<config>/skills/`, `skill/`: `SKILL.md` directories at any depth, and
  `*.md` files at the top (the OpenCode 2 file form)
- `<config>/plugins/`, `plugin/`, `tools/`, `tool/`: each `.js`, `.ts`, `.mjs`,
  or `.cjs` file at the top, and each package directory
- `~/.claude/skills/`, `~/.agents/skills/`
- `$OPENCODE_CONFIG` (an extra config file) and `$OPENCODE_CONFIG_DIR` (an
  extra directory with the layout of `.opencode`)

**Project-local (cwd and parents up to the git root):**
- `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc`
- `.opencode/` with the same layout as `<config>`
- `.claude/skills/`, `.agents/skills/`
- `AGENTS.md` and `CLAUDE.md` are handled by the cross-agent sweep.

OpenCode reads config as JSONC: comments and trailing commas are allowed.
OpenCode 1 puts MCP servers in `mcp.<name>`; OpenCode 2 nests them in
`mcp.servers.<name>`. Both shapes are read. A `servers` entry that is itself a
server definition (it has `command`, `url`, or `type`) is an OpenCode 1
server. Not scanned yet: npm plugins that a `plugin` list names (OpenCode
installs them into its cache, `~/.cache/opencode/node_modules/`), and a local
`plugin` entry that names a directory.

### 10. Amp

`<config>` is `$XDG_CONFIG_HOME/amp`, or `~/.config/amp`. Amp counts as
installed when `<config>` exists.

**User-global:**
- `<config>/settings.json`, `<config>/settings.jsonc` (one entry per server in
  the `"amp.mcpServers"` key)
- `<config>/AGENTS.md`, `~/.config/AGENTS.md`
- `<config>/skills/`, `~/.config/agents/skills/`, `~/.claude/skills/`,
  `~/.agents/skills/`
- `<config>/plugins/`: each code file at the top, and each plugin directory

**Project-local:**
- The nearest `.amp/settings.json` or `.amp/settings.jsonc`, searched from cwd
  up to the git root
- `.amp/plugins/` at the project root (the git root, or cwd without one)
- `.claude/skills/` and `.agents/skills/` in cwd and parents up to the git root
- `AGENTS.md`, `AGENT.md`, and `CLAUDE.md` are handled by the cross-agent sweep.

Amp settings are JSONC. No other Amp setting runs code. A skill can hold its
own `mcp.json`; the skill directory scan covers it.

### 11. OpenClaw

OpenClaw is a gateway. Its project is the agent workspace, not the scan's
working directory, so every OpenClaw target has `scope: "user"`. `<state>` is
`$OPENCLAW_STATE_DIR`, or `~/.openclaw`. `openclaw --profile <name>` sets
`OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH`. OpenClaw counts as installed
when `<state>` exists.

- `$OPENCLAW_CONFIG_PATH`, or `<state>/openclaw.json` (one entry per server in
  `mcp.servers` and `nodeHost.mcp.servers`). A config that OpenClaw 2026.6
  wrote keeps its servers in a root `mcpServers` map, which the current docs do
  not name; discovery reads that map too. OpenClaw reads this file as JSON5, so
  unquoted keys, single quotes, comments, and trailing commas are allowed.
- `<state>/skills/` (managed skills)
- `<state>/agents/*/agent/workshop-skills/` (Skill Workshop skills)
- `~/.agents/skills/`, only with the default state directory
- `<state>/hooks/*/` (managed hooks: each directory with `HOOK.md` and its
  handler is one target)
- `<state>/extensions/*/` (each plugin directory is one target; OpenClaw skips
  script files at the top of this directory)
- The workspace, `$OPENCLAW_WORKSPACE_DIR` or `<state>/workspace`:
  `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `BOOT.md`, `BOOTSTRAP.md`,
  `MEMORY.md`, `skills/`, and `.agents/skills/`. Older releases also inject
  `TOOLS.md` and `HEARTBEAT.md`, so these are targets too.

Not scanned yet: workspace hooks (`<workspace>/hooks/`) and workspace
extensions (`<workspace>/.openclaw/extensions/`), because OpenClaw loads them
only after the user enables them; `skills.load.extraDirs`,
`hooks.internal.load.extraDirs`, and `plugins.load.paths` from the config;
plugins that `openclaw plugins install` puts in its managed npm projects; and
workspaces that the config assigns to other agents.


## Disambiguation rules

1. When a skill appears at both user scope and project scope, list
   both rows in output and mark the `scope` column (`user` vs
   `project`).
2. Dedupe by `treeSha256` — if two discovered paths have identical
   content hash, report once and preserve the agent-to-path mapping on
   the normalized skill. Also keep the scope, format, and scan file name
   of every installation as one record. Rule selection reads these
   records, so a project copy of a user file still gets the project-only
   rules when the primary path is a user path.
   This is a registry-level invariant owned by
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
