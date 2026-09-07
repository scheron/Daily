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

function runScript(cwd: string, args: string[]): string {
  return execFileSync("node", [releaseScriptPath, ...args], {cwd, input: "", timeout: 10000}).toString()
}

function runDryRun(cwd: string, artifact: "app" | "server"): string {
  return runScript(cwd, [artifact, "--dry-run"])
}

function commitTouching(cwd: string, filePath: string, message: string): void {
  const absolute = join(cwd, filePath)
  mkdirSync(dirname(absolute), {recursive: true})
  writeFileSync(absolute, `${message}\n`)
  execFileSync("git", ["add", "-A"], {cwd})
  execFileSync("git", ["commit", "-q", "-m", message], {cwd})
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

  it("measures each artifact against a tag of its own prefix, so a server release does not become the app's baseline", () => {
    execFileSync("git", ["tag", "v1.2.3"], {cwd: repo})
    commitTouching(repo, "apps/desktop/feature.ts", "feat: a desktop change")
    execFileSync("git", ["tag", "server-v4.5.6"], {cwd: repo})

    const output = runScript(repo, ["--status"])

    expect(output).toMatch(/desktop\s+1\.2\.3\s+1 unreleased commit since v1\.2\.3/)
    expect(output).not.toContain("since server-v4.5.6")
    expect(output).toMatch(/server\s+4\.5\.6\s+up to date \(server-v4\.5\.6\)/)
  }, 30000)

  it("--status surveys both artifacts and stops there, touching nothing", () => {
    const headBefore = git(repo, ["rev-parse", "HEAD"])

    const output = runScript(repo, ["--status"])

    expect(output).toContain("Release status")
    expect(output).toContain("desktop")
    expect(output).toContain("server")
    expect(output).not.toContain("Dry run")
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(headBefore)
    expect(git(repo, ["tag"])).toBe("")
    expect(git(repo, ["status", "--porcelain"])).toBe("")
  }, 30000)

  it("warns that the other artifact has unreleased commits when only one is named", () => {
    execFileSync("git", ["tag", "v1.2.3"], {cwd: repo})
    execFileSync("git", ["tag", "server-v4.5.6"], {cwd: repo})
    commitTouching(repo, "apps/server/handler.ts", "feat: a server change")

    const output = runDryRun(repo, "app")

    expect(output).toContain("server also has 1 unreleased commit since server-v4.5.6")
  }, 30000)
})
