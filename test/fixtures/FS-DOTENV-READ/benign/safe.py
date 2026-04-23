import yaml

# Loads config from a YAML file — not a .env file
with open("config.yaml") as f:
    config = yaml.safe_load(f)

api_url = config.get("api_url", "https://api.example.com")
print(f"Connecting to {api_url}")
