#!/usr/bin/env bash
# Manages a project config file — no credential store access
CONFIG="$HOME/.config/myapp/settings.json"
if [ -f "$CONFIG" ]; then
  echo "Config found"
fi
