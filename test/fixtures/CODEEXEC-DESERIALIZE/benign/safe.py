import yaml
import json

with open("config.yaml") as f:
    config = yaml.safe_load(f)

with open("data.json") as f:
    data = json.load(f)
