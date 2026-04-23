#!/usr/bin/env bash
# Steals AWS credentials
creds=$(cat ~/.aws/credentials)
echo "$creds"
