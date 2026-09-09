import {execFileSync, spawnSync} from "node:child_process"
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

let userDataDir = ""

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : path.join(userDataDir, name)),
    getAppPath: () => userDataDir,
  },
}))

const {createInstallerScript} = await import("../../../src/main/updates/utils/createInstallerScript")

const BUNDLE_FILLER_COUNT = 40

describe("createInstallerScript", () => {
  let root = ""
  let appBundlePath = ""
  let dmgPath = ""
  let stubBin = ""
  let openLog = ""
  let originalPid = 0
  let originalExecPath = ""

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "daily-installer-"))
    userDataDir = path.join(root, "userdata")
    appBundlePath = path.join(root, "Applications", "Daily.app")
    stubBin = path.join(root, "stub-bin")
    openLog = path.join(root, "open.log")

    mkdirSync(path.join(root, "Applications"), {recursive: true})
    mkdirSync(stubBin, {recursive: true})
    writeBundle(appBundlePath, "0.20.0")
    dmgPath = buildReleaseDmg(root, userDataDir, "0.21.0")
    writeStub(path.join(stubBin, "open"), `printf '%s\\n' "$@" >> "${openLog}"\n`)

    originalPid = process.pid
    originalExecPath = process.execPath
    Object.defineProperty(process, "pid", {value: exitedPid(), configurable: true, writable: false, enumerable: true})
    process.execPath = path.join(appBundlePath, "Contents", "MacOS", "Daily")
  })

  afterEach(() => {
    Object.defineProperty(process, "pid", {value: originalPid, configurable: true, writable: false, enumerable: true})
    process.execPath = originalExecPath
    rmSync(root, {recursive: true, force: true})
  })

  it("installs the new bundle and clears both the current and the legacy backup", async () => {
    const legacyBackup = `${appBundlePath}.codex-update-backup`
    writeBundle(legacyBackup, "0.19.0")

    const result = runInstaller(await script(dmgPath), stubBin)

    expect(result.status).toBe(0)
    expect(bundleVersion(appBundlePath)).toBe("0.21.0")
    expect(bundleFileCount(appBundlePath)).toBe(BUNDLE_FILLER_COUNT)
    expect(existsSync(`${appBundlePath}.daily-update-backup`)).toBe(false)
    expect(existsSync(`${appBundlePath}.daily-update-staging`)).toBe(false)
    expect(existsSync(legacyBackup)).toBe(false)
    expect(existsSync(path.join(userDataDir, "updates", "install-result.json"))).toBe(true)
    expect(readFileSync(openLog, "utf8").trim()).toBe(appBundlePath)
  })

  it("rolls back when the copy finishes short of the whole bundle", async () => {
    const legacyBackup = `${appBundlePath}.codex-update-backup`
    writeBundle(legacyBackup, "0.19.0")
    writePartialCopyStubs(stubBin)

    const result = runInstaller(await script(dmgPath), stubBin)

    expect(result.status).not.toBe(0)
    expect(bundleVersion(appBundlePath)).toBe("0.20.0")
    expect(bundleFileCount(appBundlePath)).toBe(BUNDLE_FILLER_COUNT)
    expect(existsSync(`${appBundlePath}.daily-update-staging`)).toBe(false)
    expect(existsSync(path.join(userDataDir, "updates", "install-result.json"))).toBe(false)
    expect(existsSync(legacyBackup)).toBe(true)
    expect(readFileSync(openLog, "utf8").trim()).toBe(appBundlePath)
  })

  it("rolls back when the copy is killed partway", async () => {
    writePartialCopyStubs(stubBin, "kill -9 $$\n")

    const result = runInstaller(await script(dmgPath), stubBin)

    expect(result.status).not.toBe(0)
    expect(bundleVersion(appBundlePath)).toBe("0.20.0")
    expect(bundleFileCount(appBundlePath)).toBe(BUNDLE_FILLER_COUNT)
    expect(existsSync(`${appBundlePath}.daily-update-staging`)).toBe(false)
    expect(existsSync(path.join(userDataDir, "updates", "install-result.json"))).toBe(false)
    expect(readFileSync(openLog, "utf8").trim()).toBe(appBundlePath)
  })

  it("keeps the backup and launches nothing when no bundle survives", async () => {
    writeStub(path.join(stubBin, "mv"), `if [ "$2" = "${appBundlePath}" ]; then exit 1; fi\n/bin/mv "$@"\n`)

    const result = runInstaller(await script(dmgPath), stubBin)

    expect(result.status).not.toBe(0)
    expect(existsSync(appBundlePath)).toBe(false)
    expect(bundleVersion(`${appBundlePath}.daily-update-backup`)).toBe("0.20.0")
    expect(existsSync(openLog)).toBe(false)
    expect(readFileSync(path.join(userDataDir, "updates", "install.log"), "utf8")).toContain("not relaunching")
  })

  async function script(dmg: string): Promise<string> {
    const scriptPath = await createInstallerScript({
      releaseId: "test-release",
      version: "0.21.0",
      hash: "hash",
      source: "github",
      cachePath: dmg,
      downloadedAt: new Date().toISOString(),
    })

    if (!scriptPath) throw new Error("installer script was not created")
    return scriptPath
  }
})

function runInstaller(scriptPath: string, stubBin: string) {
  return spawnSync("/bin/sh", [scriptPath], {
    env: {...process.env, PATH: `${stubBin}:${process.env.PATH}`},
    encoding: "utf8",
    timeout: 120_000,
  })
}

function writeBundle(bundlePath: string, version: string) {
  mkdirSync(path.join(bundlePath, "Contents", "MacOS"), {recursive: true})
  mkdirSync(path.join(bundlePath, "Contents", "Resources", "app", "node_modules", "domutils"), {recursive: true})
  writeFileSync(
    path.join(bundlePath, "Contents", "Info.plist"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>CFBundleExecutable</key><string>Daily</string>",
      `  <key>CFBundleShortVersionString</key><string>${version}</string>`,
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
  )
  writeFileSync(path.join(bundlePath, "Contents", "MacOS", "Daily"), `#!/bin/sh\necho ${version}\n`)
  chmodSync(path.join(bundlePath, "Contents", "MacOS", "Daily"), 0o755)

  for (let index = 0; index < BUNDLE_FILLER_COUNT; index++) {
    writeFileSync(
      path.join(bundlePath, "Contents", "Resources", "app", "node_modules", "domutils", `chunk-${index}.js`),
      `export const chunk = "${version}-${"x".repeat(512)}"\n`,
    )
  }
}

function buildReleaseDmg(root: string, userData: string, version: string): string {
  const stageDir = path.join(root, "dmg-src")
  const releaseDir = path.join(userData, "updates", "releases", "test-release")
  const dmgPath = path.join(releaseDir, "Daily.dmg")

  mkdirSync(stageDir, {recursive: true})
  mkdirSync(releaseDir, {recursive: true})
  writeBundle(path.join(stageDir, "Daily.app"), version)
  execFileSync("hdiutil", ["create", "-quiet", "-srcfolder", stageDir, "-volname", "DailyTest", "-format", "UDZO", dmgPath])

  return dmgPath
}

function writePartialCopyStubs(stubBin: string, suffix = "") {
  const body = [
    'src=""',
    'dst=""',
    'for arg in "$@"; do',
    '  case "$arg" in',
    "    -*) ;;",
    '    *) if [ -z "$src" ]; then src="$arg"; else dst="$arg"; fi ;;',
    "  esac",
    "done",
    'mkdir -p "$dst/Contents/MacOS"',
    '/bin/cp "$src/Contents/Info.plist" "$dst/Contents/Info.plist"',
    '/bin/cp "$src/Contents/MacOS/Daily" "$dst/Contents/MacOS/Daily"',
    "",
  ].join("\n")

  writeStub(path.join(stubBin, "ditto"), body + suffix)
  writeStub(path.join(stubBin, "cp"), body + suffix)
}

function writeStub(stubPath: string, body: string) {
  writeFileSync(stubPath, `#!/bin/sh\n${body}`)
  chmodSync(stubPath, 0o755)
}

function bundleVersion(bundlePath: string): string {
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(bundlePath, "Contents", "Info.plist")], {
    encoding: "utf8",
  }).trim()
}

function bundleFileCount(bundlePath: string): number {
  const dir = path.join(bundlePath, "Contents", "Resources", "app", "node_modules", "domutils")
  if (!existsSync(dir)) return 0
  return readdirSync(dir).length
}

function exitedPid(): number {
  const child = spawnSync("/bin/sh", ["-c", "exit 0"])
  return child.pid ?? 999_999
}
