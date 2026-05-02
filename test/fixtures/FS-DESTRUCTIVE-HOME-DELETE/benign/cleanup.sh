#!/usr/bin/env bash
set -euo pipefail

rm -rf /tmp/skillaudit-build
rm -rf ./dist
rm -rf node_modules/.cache
rm -rf "$HOME/.cache/skillaudit"
rm -rf ~/.cache/skillaudit
