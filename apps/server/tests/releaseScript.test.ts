import {execFileSync} from "node:child_process"
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const releaseScriptPath = join(rootDir, "scripts", "release.js")

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {cwd}).toString().trim()
}

function readVersion(manifestPath: string): string {
  return (JSON.parse(readFileSync(manifestPath, "utf-8")) as {version: string}).version
}

function runDryRun(cwd: string, artifact: "app" | "server"): string {
  return execFileSync("node", [releaseScriptPath, artifact, "--dry-run"], {cwd, input: "", timeout: 10000}).toString()
}

describe("scripts/release.js --dry-run", () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "daily-release-dry-run-"))
    execFileSync("git", ["init", "-q"], {cwd: repo})
    execFileSync("git", ["checkout", "-q", "-b", "wip"], {cwd: repo})
    execFileSync("git", ["config", "user.email", "test@example.invalid"], {cwd: repo})
    execFileSync("git", ["config", "user.name", "Test"], {cwd: repo})

    mkdirSync(join(repo, "apps", "desktop"), {recursive: true})
    mkdirSync(join(repo, "apps", "server"), {recursive: true})
    writeFileSync(join(repo, "apps", "desktop", "package.json"), JSON.stringify({name: "@daily/desktop", version: "1.2.3"}, null, 2))
    writeFileSync(join(repo, "apps", "server", "package.json"), JSON.stringify({name: "@daily/server", version: "4.5.6"}, null, 2))
    writeFileSync(join(repo, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n")

    execFileSync("git", ["add", "-A"], {cwd: repo})
    execFileSync("git", ["commit", "-q", "-m", "chore: seed"], {cwd: repo})
  })

  afterEach(() => {
    rmSync(repo, {recursive: true, force: true})
  })

  it("TC-7: reports the manifest, version and tag for each artifact's dry run, and writes, commits, tags or pushes nothing", () => {
    const headBefore = git(repo, ["rev-parse", "HEAD"])
    const tagsBefore = git(repo, ["tag"])

    const appOutput = runDryRun(repo, "app")
    expect(appOutput).toContain("apps/desktop/package.json")
    expect(appOutput).toMatch(/\bv\d+\.\d+\.\d+\b/)

    const serverOutput = runDryRun(repo, "server")
    expect(serverOutput).toContain("apps/server/package.json")
    expect(serverOutput).toMatch(/\bserver-v\d+\.\d+\.\d+\b/)

    expect(git(repo, ["status", "--porcelain"])).toBe("")
    expect(git(repo, ["tag"])).toBe(tagsBefore)
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(headBefore)
    expect(readVersion(join(repo, "apps", "desktop", "package.json"))).toBe("1.2.3")
    expect(readVersion(join(repo, "apps", "server", "package.json"))).toBe("4.5.6")
    expect(readFileSync(join(repo, "CHANGELOG.md"), "utf-8")).toBe("# Changelog\n\n## [Unreleased]\n\n")
  }, 30000)
})
