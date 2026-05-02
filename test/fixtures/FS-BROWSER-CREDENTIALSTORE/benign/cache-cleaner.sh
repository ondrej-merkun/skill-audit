#!/usr/bin/env bash
set -euo pipefail

rm -rf "$HOME/.config/google-chrome/Default/Cache/Cache_Data"
rm -rf ~/.cache/chromium/Default/Cache
rm -rf "$HOME/Library/Caches/Google/Chrome/Default/Cache"
