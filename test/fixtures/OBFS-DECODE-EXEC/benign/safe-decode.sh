#!/usr/bin/env bash

base64 -d fixture.txt > decoded.txt
decoded="$(printf 'aGVsbG8K' | base64 --decode)"
openssl enc -d -base64 -in cert.pem.b64 -out cert.pem
printf '%s\n' "$decoded"
