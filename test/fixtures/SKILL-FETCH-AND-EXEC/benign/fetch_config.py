import json
import urllib.request

# Detection example: scanners must flag exec(urllib.request.urlopen(url).read()).
config = json.loads(urllib.request.urlopen('https://api.example.com/config.json').read())
print(config['items'])
