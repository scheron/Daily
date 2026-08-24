import {execFileSync} from "node:child_process"
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const scriptPath = join(rootDir, "scripts", "build-server-package.js")

function runScript(cwd: string, env: NodeJS.ProcessEnv = {}): void {
  execFileSync("node", [scriptPath], {cwd, env: {...process.env, ...env}, stdio: "pipe"})
}

function readGeneratedPackage(cwd: string): {version: string; dependencies: Record<string, string>} {
  return JSON.parse(readFileSync(join(cwd, "dist-server", "package.json"), "utf-8"))
}

describe("build-server-package", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "daily-server-package-"))
    mkdirSync(join(root, "out", "server"), {recursive: true})
    writeFileSync(join(root, "out", "server", "index.js"), 'import {Command} from "commander"\n', "utf-8")
    writeFileSync(join(root, "LICENSE"), "MIT\n", "utf-8")
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({name: "daily", version: "9.9.9", license: "MIT", dependencies: {commander: "^15.0.0"}}),
      "utf-8",
    )
  })

  afterEach(() => {
    rmSync(root, {recursive: true, force: true})
  })

  it("falls back to the root package version when DAILY_SERVER_PACKAGE_VERSION is not set", () => {
    runScript(root, {DAILY_SERVER_PACKAGE_VERSION: undefined})

    expect(readGeneratedPackage(root).version).toBe("9.9.9")
  })

  it("takes the version from DAILY_SERVER_PACKAGE_VERSION when it is set", () => {
    runScript(root, {DAILY_SERVER_PACKAGE_VERSION: "1.2.3"})

    expect(readGeneratedPackage(root).version).toBe("1.2.3")
  })

  it("falls back to the root package version when DAILY_SERVER_PACKAGE_VERSION is blank", () => {
    runScript(root, {DAILY_SERVER_PACKAGE_VERSION: "  "})

    expect(readGeneratedPackage(root).version).toBe("9.9.9")
  })

  it("derives the dependencies the bundle imports from the root package", () => {
    runScript(root)

    expect(readGeneratedPackage(root).dependencies).toEqual({commander: "^15.0.0"})
  })

  it("fails when the bundle imports something the root package does not declare", () => {
    writeFileSync(join(root, "out", "server", "index.js"), 'import Database from "better-sqlite3"\n', "utf-8")

    expect(() => runScript(root)).toThrow(/better-sqlite3/)
  })
})
