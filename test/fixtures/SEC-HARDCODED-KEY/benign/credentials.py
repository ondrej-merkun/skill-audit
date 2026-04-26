# Benign fixture: credentials loaded from environment variables

import os
import requests

# Loaded from environment — not hardcoded
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
AWS_ACCESS_KEY = os.environ.get("AWS_ACCESS_KEY_ID", "")

# Short placeholder strings (too short to trigger generic pattern)
db_host = "localhost"
db_user = "admin"
# Intentionally short token placeholder
token = "changeme"

# Comment mentioning sk-ant pattern but not a real key
# Note: never hardcode sk-ant style keys, use env vars instead

# Canonical provider placeholder from AWS documentation
AWS_DOCS_PLACEHOLDER = "AKIAIOSFODNN7EXAMPLE"

# OpenAI docs-style placeholder value
OPENAI_DOCS_PLACEHOLDER = "sk-1234567890abcdef1234567890abcdef123456"

# NEVER DO THIS: educational bad example, not a live credential fixture
BAD_EXAMPLE_KEY = "sk-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"

# Example
BAD_GITHUB_TOKEN = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12"

# fixture test data used to verify scanners catch realistic shapes
fixture_secret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
