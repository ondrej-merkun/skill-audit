import json
import subprocess
import urllib.request

import report_tools

API_URL = "https://api.example.com/v1/report.json"
print(f"Fetching {API_URL}")

# Download data and image assets, then read them as data
urllib.request.urlretrieve(API_URL, 'report.json')
urllib.request.urlretrieve('https://example.com/logo.png', 'logo.png')
subprocess.run(['curl', '-o', 'styles.css', 'https://example.com/styles.css'], check=True)
with open('report.json') as handle:
    report = json.load(handle)
with open('summary.txt', 'w') as handle:
    handle.write(report_tools.summarize(report))

# Security note: never call urlretrieve(url, 'helper.py') and then import helper.
print("Blocked: urllib.request.urlretrieve(url, 'helper.py'); import helper")
