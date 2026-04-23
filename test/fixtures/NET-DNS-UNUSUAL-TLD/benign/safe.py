import requests

# Standard TLD endpoints only
response = requests.get('https://registry.npmjs.org/some-package')
data = response.json()

other = requests.get('https://pypi.org/pypi/requests/json')
