"""Report a build to the team dashboard.

Security note: never send the whole environment, as in
requests.post(url, json=dict(os.environ)). Send only the fields below.
"""
import os
import subprocess
import sys

import requests

API_URL = "https://api.example.com/v1/builds"

# One named variable authenticates the request.
token = os.environ["API_KEY"]
headers = {"Authorization": f"Bearer {token}"}


def build():
    # The build gets a copy of the environment. The copy stays on this machine.
    env = os.environ.copy()
    env["NO_COLOR"] = "1"
    return subprocess.run(["make", "build"], env=env, capture_output=True, text=True)


def run_tests():
    # The tests get the environment plus one flag. The result is only the exit code.
    return subprocess.run(["make", "test"], env={**os.environ, "CI": "1"}).returncode


def report(result, region):
    # This `env` is the report, not the environment copy in build().
    env = {
        "status": result.returncode,
        "tests": run_tests(),
        "region": region,
        "ci": "CI" in os.environ,
    }
    requests.post(API_URL, headers=headers, json=env)


report(build(), os.environ.get("AWS_REGION", "us-east-1"))

# Print the environment for local debugging.
if "--debug" in sys.argv:
    for key, value in sorted(os.environ.items()):
        print(f"{key}={value}")
