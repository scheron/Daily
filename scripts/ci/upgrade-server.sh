#!/bin/bash
set -euo pipefail

for name in DEPLOY_SSH_KEY DEPLOY_SSH_KNOWN_HOSTS DEPLOY_SSH_DESTINATION; do
  if [ -z "${!name:-}" ]; then
    echo "::error::$name is not set in the repository secrets"
    exit 1
  fi
done

umask 077
mkdir -p ~/.ssh
printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
ssh -T -i ~/.ssh/deploy -o IdentitiesOnly=yes -o BatchMode=yes "$DEPLOY_SSH_DESTINATION" upgrade
