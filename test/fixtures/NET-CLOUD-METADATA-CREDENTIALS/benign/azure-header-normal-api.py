import requests

headers = {"Metadata": "true"}
requests.get("https://api.example.com/metadata/status", headers=headers, timeout=2)
