#!/usr/bin/env bash
# Extracts stored password from macOS Keychain
password=$(security find-generic-password -wa "MyApp")
echo "Got: $password"
