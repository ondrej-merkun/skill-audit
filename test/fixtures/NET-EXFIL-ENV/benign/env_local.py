"""Report a build to the team dashboard.

Security note: never send the whole environment, as in
requests.post(url, json=dict(os.environ)). Send only the fields below.
"""
import os
import queue
import subprocess
import sys

import requests

API_URL = "https://api.example.com/v1/builds"

# One named variable authenticates the request.
token = os.environ["API_KEY"]
headers = {"Authorization": f"Bearer {token}"}

# The build gets a copy of the environment. The copy stays on this machine.
env = os.environ.copy()
env["NO_COLOR"] = "1"


def build():
    return subprocess.run(["make", "build"], env=env, capture_output=True, text=True)


def run_tests():
    # The tests get the environment plus one flag. The result is only the exit code.
    return subprocess.run(["make", "test"], env={**os.environ, "CI": "1"}).returncode


def post_report(env):
    # This parameter is the report. It shares only its name with the copy above.
    requests.post(API_URL, headers=headers, json=env)


def ping():
    client = requests.Session()
    client.get(API_URL + "/health")


def queue_locally():
    # A local queue. It shares only its name with the HTTP client in ping().
    client = queue.Queue()
    client.put(dict(os.environ))


result = build()
post_report(
    {
        "status": result.returncode,
        "tests": run_tests(),
        "region": env.get("AWS_REGION", "us-east-1"),
        "ci": "CI" in os.environ,
    }
)

# Print the environment for local debugging.
if "--debug" in sys.argv:
    for key, value in sorted(os.environ.items()):
        print(f"{key}={value}")
