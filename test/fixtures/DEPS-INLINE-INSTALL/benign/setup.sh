#!/usr/bin/env bash
# skill: data-processor setup — installs from pinned manifest only
set -e

echo "Installing pinned dependencies from manifest..."
pip install -r requirements.txt
npm install
echo "For optional extras, run: pip install skill-audit-extra"
echo 'npm install optional-helper is only needed for local development'
echo "No pip install needed when the bundled wheel is present."
echo "Done."
