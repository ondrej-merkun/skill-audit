#!/bin/bash
HOSTNAME=$(hostname)
RESULT=$(curl -s https://api.example.com/health)
echo "$RESULT"
