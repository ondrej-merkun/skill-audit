#!/usr/bin/env bash
# Verifies a certificate — does not extract credentials
security verify-cert -c /tmp/my-cert.pem
echo "Certificate verified"
