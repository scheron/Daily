#!/bin/bash
set -euo pipefail

# Verifies the released .dmg by opening it and inspecting what is actually inside,
# rather than only asserting that a file was produced.
#
# Two checks run against the app inside the mounted image:
#   1. static  - every package in the runtime dependency closure resolves inside app.asar
#   2. runtime - the packaged Electron binary loads those packages and exercises the native module
#
# Check 1 is the gate that catches a silently incomplete bundle. See the note at the
# bottom of this file for why a GUI launch is deliberately not part of it.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/desktop/dist"

MOUNT_POINT=""
cleanup() {
  if [ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT" ]; then
    hdiutil detach "$MOUNT_POINT" -quiet -force >/dev/null 2>&1 || true
    rmdir "$MOUNT_POINT" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! compgen -G "$DIST_DIR/*.dmg" >/dev/null; then
  echo "::error::electron-builder did not produce a .dmg"
  echo "=== $DIST_DIR contents ==="
  ls -la "$DIST_DIR" 2>&1 || echo "($DIST_DIR does not exist)"
  exit 1
fi
ls -lh "$DIST_DIR"/*.dmg

status=0
for dmg in "$DIST_DIR"/*.dmg; do
  echo ""
  echo "=== verifying $(basename "$dmg") ==="

  MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/daily-dmg-XXXXXX")"
  if ! hdiutil attach "$dmg" -nobrowse -readonly -noverify -mountpoint "$MOUNT_POINT" >/dev/null; then
    echo "::error::could not mount $dmg"
    status=1
    cleanup
    MOUNT_POINT=""
    continue
  fi

  app="$(find "$MOUNT_POINT" -maxdepth 1 -name '*.app' -print -quit)"
  if [ -z "$app" ]; then
    echo "::error::no .app bundle inside $(basename "$dmg")"
    ls -la "$MOUNT_POINT"
    status=1
    cleanup
    MOUNT_POINT=""
    continue
  fi
  echo "mounted: $app"

  if ! node "$SCRIPT_DIR/verify-bundle-closure.mjs" "$app"; then
    status=1
  fi

  executable="$(plutil -extract CFBundleExecutable raw "$app/Contents/Info.plist" 2>/dev/null || basename "$app" .app)"
  binary="$app/Contents/MacOS/$executable"
  if [ ! -x "$binary" ]; then
    echo "::error::packaged executable not found at $binary"
    status=1
  elif ! ELECTRON_RUN_AS_NODE=1 "$binary" "$SCRIPT_DIR/probe-bundle-runtime.cjs" "$app"; then
    status=1
  fi

  cleanup
  MOUNT_POINT=""
done

if [ "$status" -ne 0 ]; then
  echo ""
  echo "::error::.dmg verification failed - do not publish this build"
  exit 1
fi
echo ""
echo ".dmg verification passed"

# Why no GUI launch:
# A windowed launch was measured against a genuinely incomplete bundle (one built by
# electron-builder 26.7.0 that was missing five packages) and it started and ran fine,
# because the dropped packages were not on the startup path. It therefore does not gate
# this defect class, while being the flakiest thing to run on a headless CI runner.
# The runtime probe above still starts the packaged binary and loads the shipped modules;
# the static closure check is what actually catches an incomplete bundle.
