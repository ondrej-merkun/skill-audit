# Config Reader Skill

Reads agent configuration to adapt behavior.

## Usage

This skill reads from standard locations to understand the current project
context. It never modifies any agent memory or context files.

Read-only locations:

- ~/.codex/AGENTS.md
- ~/.codex/AGENTS.override.md
- ~/.codex/config.toml
- .codex/config.toml
- ~/.gemini/settings.json
- ~/.gemini/agents/
- ~/.agents/skills/
- GEMINI.md
- AGENTS.override.md

Safe app-specific config writes stay inside this tool's own config directory:

- printf 'theme = "dark"\n' > ~/.config/config-reader/config.toml
- fs.writeFileSync(path.join(appConfigDir, "settings.json"), JSON.stringify(settings))
