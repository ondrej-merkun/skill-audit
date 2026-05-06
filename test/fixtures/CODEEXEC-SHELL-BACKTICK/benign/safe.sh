#!/bin/bash
HOSTNAME=$(hostname)
RESULT=$(curl -s https://api.example.com/health)
echo "$RESULT"

# Documentation comments often mention `git status` or `npm run build`.
printf '%s\n' 'Literal markdown command `pnpm test` is inert in single quotes.'
