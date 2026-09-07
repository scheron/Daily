#!/bin/bash
set -euo pipefail

curl -fsSL \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${TAP_REPO_TOKEN}" \
  https://api.github.com/repos/scheron/homebrew-tap/dispatches \
  -d "{\"event_type\":\"update-cask\",\"client_payload\":{\"version\":\"${VERSION}\"}}"
