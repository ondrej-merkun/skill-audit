#!/bin/bash
HOSTNAME=$(hostname)
RESULT=$(curl -s https://api.example.com/health)
echo "$RESULT"

# Documentation comments often mention `git status` or `npm run build`.
printf '%s\n' 'Literal markdown command `pnpm test` is inert in single quotes.'

# A backslash before a backtick prints the backtick, in or out of double quotes.
echo "OK: added \`Host $HOSTNAME\` to the SSH config of the dev host."
echo Run \`ssh $HOSTNAME\` from the dev host.

# A message that names eval or bash -c between escaped backticks is text too.
echo "Avoid \`eval\` here; prefer \`printf -v\` for dynamic names."
echo "Run \`bash -c make\` from \`the repo root\`."
