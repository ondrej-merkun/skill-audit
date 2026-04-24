# markdown-formatter

Lints and reformats Markdown files for consistency: heading hierarchy, link labels,
code fence language tags, and trailing whitespace.

<markdown-formatter>
Use this skill to clean up Markdown documents.

Commands:
- `lint <file>` — report formatting issues without modifying the file
- `fix <file>` — apply automatic fixes in place (makes a `.bak` backup first)
- `check-links <file>` — verify that relative links resolve to existing files
- `toc <file>` — generate a table-of-contents block for insertion

Fixes applied automatically:
- ATX headings (converts setext `====` / `----` to `#` style)
- Trailing whitespace removal
- Blank line after headings
- Consistent ordered list numbering (1. 2. 3. …)

No network access. All operations are local file reads and writes.
</markdown-formatter>
