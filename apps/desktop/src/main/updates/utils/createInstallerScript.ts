import {existsSync} from "node:fs"
import {mkdir, writeFile} from "node:fs/promises"
import path from "node:path"

import {APP_CONFIG} from "@daily/protocol"

import {electronPaths} from "@main/runtime/electronPaths"

import type {AppUpdateCacheState, InstalledAppReleaseState} from "@daily/protocol"

const BACKUP_SUFFIX = ".daily-update-backup"
const LEGACY_BACKUP_SUFFIX = ".codex-update-backup"
const STAGE_SUFFIX = ".daily-update-staging"

/**
 * Writes the shell script that swaps the running bundle for a downloaded release.
 *
 * The script stages the new bundle next to the installed one, proves the copy is
 * whole, and only then renames it into place. Anything short of a verified copy
 * restores the backup instead of leaving a half-written bundle behind.
 */
export async function createInstallerScript(cachedUpdate: AppUpdateCacheState): Promise<string | null> {
  const appBundlePath = path.resolve(process.execPath, "../../..")
  const relaunchPath = appBundlePath
  const installResult: InstalledAppReleaseState = {
    releaseId: cachedUpdate.releaseId,
    version: cachedUpdate.version,
    hash: cachedUpdate.hash,
    source: cachedUpdate.source,
    installedAt: new Date().toISOString(),
  }

  if (!cachedUpdate.cachePath || !existsSync(cachedUpdate.cachePath)) return null

  const releasesDir = electronPaths.updatesReleasesPath()
  if (!path.resolve(cachedUpdate.cachePath).startsWith(path.resolve(releasesDir))) return null

  const updatesDir = electronPaths.updatesPath()
  const scriptPath = path.join(updatesDir, `install-${Date.now()}.sh`)
  await mkdir(updatesDir, {recursive: true})

  const q = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
  const script = [
    "#!/bin/sh",
    "set -eu",
    `TARGET_PID=${process.pid}`,
    `PROVIDER=${q(cachedUpdate.source)}`,
    `APP_BUNDLE_PATH=${q(appBundlePath)}`,
    `RELAUNCH_PATH=${q(relaunchPath)}`,
    `APP_NAME=${q(APP_CONFIG.name)}`,
    `DOWNLOAD_PATH=${q(cachedUpdate.cachePath ?? "")}`,
    `MARKER_PATH=${q(electronPaths.updatesInstallResultPath())}`,
    `MARKER_JSON=${q(JSON.stringify(installResult))}`,
    `LOG_PATH=${q(electronPaths.updatesInstallLogPath())}`,
    `CLEANUP_PATH=${q(cachedUpdate.cachePath ?? "")}`,
    "SUCCESS=0",
    "MOUNT_POINT=",
    "SOURCE_APP=",
    `BACKUP_PATH="$APP_BUNDLE_PATH${BACKUP_SUFFIX}"`,
    `LEGACY_BACKUP_PATH="$APP_BUNDLE_PATH${LEGACY_BACKUP_SUFFIX}"`,
    `STAGE_PATH="$APP_BUNDLE_PATH${STAGE_SUFFIX}"`,
    "log() {",
    '  mkdir -p "$(dirname "$LOG_PATH")" >/dev/null 2>&1 || true',
    '  printf \'%s %s\\n\' "$(date -u \'+%Y-%m-%dT%H:%M:%SZ\')" "$1" >>"$LOG_PATH" 2>/dev/null || true',
    "}",
    "fail() {",
    '  log "install failed: $1"',
    "  exit 1",
    "}",
    "bundle_entries() {",
    "  find \"$1\" 2>/dev/null | wc -l | tr -d ' '",
    "}",
    "bundle_bytes() {",
    "  find \"$1\" -type f -print0 2>/dev/null | xargs -0 stat -f '%z' 2>/dev/null | awk '{total += $1} END {print total + 0}'",
    "}",
    "verify_bundle() {",
    '  [ -d "$1" ] || return 1',
    '  [ -f "$1/Contents/Info.plist" ] || return 1',
    "  bundle_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' \"$1/Contents/Info.plist\" 2>/dev/null) || return 1",
    '  [ -n "$bundle_executable" ] || return 1',
    '  [ -x "$1/Contents/MacOS/$bundle_executable" ] || return 1',
    "  return 0",
    "}",
    "verify_copy() {",
    '  verify_bundle "$2" || return 1',
    '  [ "$(bundle_entries "$1")" = "$(bundle_entries "$2")" ] || return 1',
    '  [ "$(bundle_bytes "$1")" = "$(bundle_bytes "$2")" ] || return 1',
    '  if codesign --verify --strict "$1" >/dev/null 2>&1; then',
    '    codesign --verify --strict "$2" >/dev/null 2>&1 || return 1',
    "  fi",
    "  return 0",
    "}",
    "relaunch_app() {",
    '  if verify_bundle "$RELAUNCH_PATH"; then',
    '    open "$RELAUNCH_PATH" >/dev/null 2>&1 || true',
    "  else",
    '    log "nothing launchable at $RELAUNCH_PATH; not relaunching"',
    "  fi",
    "}",
    "cleanup() {",
    "  status=$?",
    "  set +e",
    "  trap - EXIT",
    '  if [ -n "$MOUNT_POINT" ]; then hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1; fi',
    '  rm -rf "$STAGE_PATH" >/dev/null 2>&1',
    '  if [ "$SUCCESS" -eq 1 ]; then',
    '    rm -rf "$BACKUP_PATH" >/dev/null 2>&1',
    '    rm -rf "$LEGACY_BACKUP_PATH" >/dev/null 2>&1',
    '    if [ -n "$CLEANUP_PATH" ] && [ -e "$CLEANUP_PATH" ]; then rm -rf "$CLEANUP_PATH" >/dev/null 2>&1; fi',
    '    if [ -n "$CLEANUP_PATH" ]; then rmdir "$(dirname "$CLEANUP_PATH")" >/dev/null 2>&1; fi',
    '    log "installed $APP_NAME at $APP_BUNDLE_PATH"',
    "  else",
    '    log "install did not complete (status $status); restoring the previous bundle"',
    '    if ! verify_bundle "$APP_BUNDLE_PATH"; then',
    '      rm -rf "$APP_BUNDLE_PATH" >/dev/null 2>&1',
    '      if [ -d "$BACKUP_PATH" ]; then',
    '        mv "$BACKUP_PATH" "$APP_BUNDLE_PATH" >/dev/null 2>&1',
    '      elif [ -d "$LEGACY_BACKUP_PATH" ]; then',
    '        mv "$LEGACY_BACKUP_PATH" "$APP_BUNDLE_PATH" >/dev/null 2>&1',
    "      fi",
    "    fi",
    '    if verify_bundle "$APP_BUNDLE_PATH"; then',
    '      log "restored the previous bundle at $APP_BUNDLE_PATH"',
    "    else",
    '      log "no usable bundle at $APP_BUNDLE_PATH; a copy is kept at $BACKUP_PATH"',
    "    fi",
    "  fi",
    "  relaunch_app",
    '  rm -f "$0" >/dev/null 2>&1',
    '  exit "$status"',
    "}",
    "trap cleanup EXIT",
    'log "installing $APP_NAME from $PROVIDER: $DOWNLOAD_PATH"',
    'while kill -0 "$TARGET_PID" >/dev/null 2>&1; do sleep 1; done',
    'rm -rf "$STAGE_PATH" >/dev/null 2>&1 || true',
    'MOUNT_POINT=$(hdiutil attach "$DOWNLOAD_PATH" -nobrowse | awk \'/\\/Volumes\\// { $1=$2=""; sub(/^  */, ""); print; exit }\')',
    '[ -n "$MOUNT_POINT" ] || fail "could not mount $DOWNLOAD_PATH"',
    'SOURCE_APP="$MOUNT_POINT/$APP_NAME.app"',
    'verify_bundle "$SOURCE_APP" || fail "the downloaded disk image has no usable $APP_NAME.app"',
    'ditto --noqtn "$SOURCE_APP" "$STAGE_PATH" || fail "could not copy the new bundle to $STAGE_PATH"',
    'xattr -rd com.apple.quarantine "$STAGE_PATH" >/dev/null 2>&1 || true',
    'verify_copy "$SOURCE_APP" "$STAGE_PATH" || fail "the copy at $STAGE_PATH is incomplete"',
    'rm -rf "$BACKUP_PATH" >/dev/null 2>&1 || true',
    'if [ -e "$APP_BUNDLE_PATH" ]; then mv "$APP_BUNDLE_PATH" "$BACKUP_PATH"; fi',
    'mv "$STAGE_PATH" "$APP_BUNDLE_PATH"',
    'verify_bundle "$APP_BUNDLE_PATH" || fail "the installed bundle at $APP_BUNDLE_PATH is not launchable"',
    'mkdir -p "$(dirname "$MARKER_PATH")"',
    'printf \'%s\' "$MARKER_JSON" > "$MARKER_PATH"',
    "SUCCESS=1",
    "",
  ].join("\n")

  await writeFile(scriptPath, script, {mode: 0o700})
  return scriptPath
}
