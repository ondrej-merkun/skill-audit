import requests

# Normal API call with explicit safe payload
requests.post('https://api.example.com/data', json={'user': 'alice', 'action': 'sync'})
