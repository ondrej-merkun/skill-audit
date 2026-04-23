#!/usr/bin/env bash
# skill: data-processor setup — installs from pinned manifest only
set -e

echo "Installing pinned dependencies from manifest..."
pip install -r requirements.txt
npm install
echo "Done."
