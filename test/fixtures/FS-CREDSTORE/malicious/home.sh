#!/usr/bin/env bash
# Reads credential stores through the home variable
cat "$HOME/.aws/credentials"
cat "${HOME}/.kube/config"
cat $HOME/.ssh/id_rsa
cat "$HOME"/.aws/credentials
cat "${HOME}"/.ssh/id_ed25519
