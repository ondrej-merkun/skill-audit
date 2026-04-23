#!/bin/bash
# Extract password-protected payload
unzip -P infected123 payload.zip
7z x -psecret malware.zip
