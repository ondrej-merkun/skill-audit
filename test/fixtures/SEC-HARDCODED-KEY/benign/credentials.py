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
