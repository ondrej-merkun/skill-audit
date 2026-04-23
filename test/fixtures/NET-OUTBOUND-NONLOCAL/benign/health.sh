#!/bin/bash
# Health check against local service only
curl http://localhost:8080/health
curl http://127.0.0.1:3000/ping
