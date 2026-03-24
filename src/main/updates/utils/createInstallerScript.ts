import {existsSync} from "node:fs"
import {mkdir, writeFile} from "node:fs/promises"
import path from "node:path"

import {APP_CONFIG, fsPaths} from "@/config"

import type {AppUpdateCacheState, InstalledAppReleaseState} from "@shared/types/storage"

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

  const releasesDir = fsPaths.updatesReleasesPath()
  if (!path.resolve(cachedUpdate.cachePath).startsWith(path.resolve(releasesDir))) return null

  const updatesDir = fsPaths.updatesPath()
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
    `MARKER_PATH=${q(fsPaths.updatesInstallResultPath())}`,
    `MARKER_JSON=${q(JSON.stringify(installResult))}`,
    `CLEANUP_PATH=${q(cachedUpdate.cachePath ?? "")}`,
    "SUCCESS=0",
    "MOUNT_POINT=",
    'BACKUP_PATH="$APP_BUNDLE_PATH.codex-update-backup"',
    "relaunch_app() {",
    '  if [ -d "$RELAUNCH_PATH" ]; then open "$RELAUNCH_PATH" >/dev/null 2>&1 || true; else open -a "$APP_NAME" >/dev/null 2>&1 || true; fi',
    "}",
    "cleanup() {",
    '  if [ -n "$MOUNT_POINT" ]; then hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true; fi',
    '  if [ "$SUCCESS" -ne 1 ]; then',
    '    if [ -d "$BACKUP_PATH" ] && [ ! -d "$APP_BUNDLE_PATH" ]; then mv "$BACKUP_PATH" "$APP_BUNDLE_PATH"; fi',
    "    relaunch_app",
    "  else",
    '    rm -rf "$BACKUP_PATH" >/dev/null 2>&1 || true',
    '    if [ -n "$CLEANUP_PATH" ] && [ -e "$CLEANUP_PATH" ]; then rm -rf "$CLEANUP_PATH" >/dev/null 2>&1 || true; fi',
    '    if [ -n "$CLEANUP_PATH" ]; then rmdir "$(dirname "$CLEANUP_PATH")" >/dev/null 2>&1 || true; fi',
    "  fi",
    '  rm -f "$0" >/dev/null 2>&1 || true',
    "}",
    "trap cleanup EXIT",
    'while kill -0 "$TARGET_PID" >/dev/null 2>&1; do sleep 1; done',
    '  MOUNT_POINT=$(hdiutil attach "$DOWNLOAD_PATH" -nobrowse | awk \'/\\/Volumes\\// { $1=$2=""; sub(/^  */, ""); print; exit }\')',
    '  if [ -z "$MOUNT_POINT" ]; then exit 1; fi',
    '  rm -rf "$BACKUP_PATH" >/dev/null 2>&1 || true',
    '  if [ -d "$APP_BUNDLE_PATH" ]; then mv "$APP_BUNDLE_PATH" "$BACKUP_PATH"; fi',
    '  cp -R "$MOUNT_POINT/Daily.app" "$APP_BUNDLE_PATH"',
    '  if [ ! -d "$APP_BUNDLE_PATH" ]; then',
    '    rm -rf "$APP_BUNDLE_PATH" >/dev/null 2>&1 || true',
    '    if [ -d "$BACKUP_PATH" ]; then mv "$BACKUP_PATH" "$APP_BUNDLE_PATH"; fi',
    "    exit 1",
    "  fi",
    '  xattr -rd com.apple.quarantine "$APP_BUNDLE_PATH" >/dev/null 2>&1 || true',
    'mkdir -p "$(dirname "$MARKER_PATH")"',
    'printf \'%s\' "$MARKER_JSON" > "$MARKER_PATH"',
    "SUCCESS=1",
    "relaunch_app",
    "",
  ].join("\n")

  await writeFile(scriptPath, script, {mode: 0o700})
  return scriptPath
}
