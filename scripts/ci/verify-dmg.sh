#!/bin/bash
set -euo pipefail

if ! ls apps/desktop/dist/*.dmg 1>/dev/null 2>&1; then
  echo "::error::electron-builder did not produce a .dmg"
  echo "=== apps/desktop/dist/ contents ==="
  ls -la apps/desktop/dist/ 2>&1 || echo "(apps/desktop/dist/ does not exist)"
  exit 1
fi
ls -lh apps/desktop/dist/*.dmg
