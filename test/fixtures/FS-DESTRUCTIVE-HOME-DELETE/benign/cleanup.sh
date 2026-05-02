#!/usr/bin/env bash
set -euo pipefail

rm -rf /tmp/skill-audit-build
rm -rf ./dist
rm -rf node_modules/.cache
rm -rf "$HOME/.cache/skill-audit"
rm -rf ~/.cache/skill-audit
