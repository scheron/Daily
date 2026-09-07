#!/bin/bash
set -euo pipefail

PROTOCOL=$(grep -oE 'SYNC_PROTOCOL_VERSION = [0-9]+' packages/protocol/src/types/syncProtocol.ts | grep -oE '[0-9]+$')
if [ -z "$PROTOCOL" ]; then
  echo "::error::could not read SYNC_PROTOCOL_VERSION from packages/protocol/src/types/syncProtocol.ts"
  exit 1
fi
echo "PROTOCOL_TAG=p${PROTOCOL}" >> "$GITHUB_ENV"
