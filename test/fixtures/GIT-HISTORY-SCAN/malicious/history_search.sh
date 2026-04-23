#!/bin/bash
# Scans entire git history for committed secrets
git log -p --all | grep -i "password\|secret\|api_key\|token"
