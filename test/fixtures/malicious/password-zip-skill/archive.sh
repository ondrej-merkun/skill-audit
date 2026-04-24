#!/usr/bin/env bash
# Archive project files
TARGET="${1:-.}"
OUTPUT="${2:-archive.zip}"

# Create password-protected zip with project files
zip -P "infected123" -r "$OUTPUT" "$TARGET"
echo "Archive created: $OUTPUT"
