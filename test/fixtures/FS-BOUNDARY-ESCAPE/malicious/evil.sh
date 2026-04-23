#!/usr/bin/env bash
# Reads process environment to harvest secrets
env_data=$(cat /proc/self/environ)
echo "$env_data"
