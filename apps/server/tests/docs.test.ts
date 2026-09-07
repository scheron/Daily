import {existsSync, readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const FORBIDDEN_SRC_ROOTS = ["main", "renderer", "shared"]
const TOP_LEVEL_PATH_DIRS = ["src", "apps", "packages", "scripts", ".claude", ".github"]

function read(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), "utf-8")
}

function hasBareSrcRoot(text: string, root: string): boolean {
  return new RegExp(`(?<![\\w/])src/${root}\\b`).test(text)
}

function extractMarkdownRelativeLinks(text: string): string[] {
  const links = [...text.matchAll(/\]\((\.[^)\s]+)\)/g)].map((match) => match[1])
  const srcAttrs = [...text.matchAll(/src="(\.[^"]+)"/g)].map((match) => match[1])
  return [...links, ...srcAttrs]
}

function extractPathLikeBackticks(text: string): string[] {
  const candidates = [...text.matchAll(/`([a-zA-Z0-9_./-]+)`/g)].map((match) => match[1])
  return candidates.filter(
    (candidate) =>
      candidate.includes("/") &&
      (TOP_LEVEL_PATH_DIRS.some((dir) => candidate === dir || candidate.startsWith(`${dir}/`)) || /\.(ts|js|json|md|ya?ml|sh)$/.test(candidate)),
  )
}

function extractDockerDocumentationPath(text: string): string | null {
  const label = /org\.opencontainers\.image\.documentation="([^"]+)"/.exec(text)
  if (!label) return null

  const path = /blob\/main\/(.+)$/.exec(label[1])
  return path ? path[1] : null
}

function extractRawGithubInstallPath(text: string): string | null {
  const match = /https:\/\/raw\.githubusercontent\.com\/scheron\/Daily\/main\/([^\s"'`)]+)/.exec(text)
  return match ? match[1] : null
}

describe("TC-12: README.md, CLAUDE.md and the Dockerfile labels name paths that exist", () => {
  it("every relative link in README.md resolves, and no CLI or folder/SSH provider survives", () => {
    const readme = read("README.md")

    for (const link of extractMarkdownRelativeLinks(readme)) {
      expect(existsSync(join(rootDir, link)), `README.md link ${link}`).toBe(true)
    }

    for (const root of FORBIDDEN_SRC_ROOTS) {
      expect(hasBareSrcRoot(readme, root), `README.md should not reference the pre-split src/${root}`).toBe(false)
    }

    expect(readme).not.toMatch(/\bCLI\b/i)
    expect(readme).not.toMatch(/\bfolder\b/i)
    expect(readme).not.toMatch(/\bSSH\b/)
  })

  it("every path CLAUDE.md names resolves, and no CLI or folder/SSH provider survives", () => {
    const claude = read("CLAUDE.md")

    for (const path of extractPathLikeBackticks(claude)) {
      expect(existsSync(join(rootDir, path)), `CLAUDE.md path ${path}`).toBe(true)
    }

    for (const root of FORBIDDEN_SRC_ROOTS) {
      expect(hasBareSrcRoot(claude, root), `CLAUDE.md should not reference the pre-split src/${root}`).toBe(false)
    }

    expect(claude).not.toMatch(/\bCLI\b/i)
    expect(claude).not.toMatch(/\bfolder\b/i)
    expect(claude).not.toMatch(/\bSSH\b/)
  })

  it("the Dockerfile's documentation label points at a README that exists", () => {
    const dockerfile = read("Dockerfile")
    const path = extractDockerDocumentationPath(dockerfile)

    expect(path).not.toBeNull()
    if (path) expect(existsSync(join(rootDir, path)), `Dockerfile documentation label ${path}`).toBe(true)
  })
})

describe("TC-16: apps/server/README.md describes the three deploy scenarios and nothing that no longer exists", () => {
  it("every relative link resolves, none of the removed variables or the own-certificate mode survive, and the file stays under 160 lines", () => {
    const readme = read("apps/server/README.md")

    for (const link of extractMarkdownRelativeLinks(readme)) {
      expect(existsSync(join(rootDir, link)), `apps/server/README.md link ${link}`).toBe(true)
    }

    for (const removed of ["DAILY_SERVER_CERT", "DAILY_SERVER_KEY", "own-certificate", "external: true"]) {
      expect(readme, `apps/server/README.md should not mention ${removed}`).not.toContain(removed)
    }

    const lineCount = readme.trimEnd().split("\n").length
    expect(lineCount, "apps/server/README.md should be under 160 lines").toBeLessThan(160)
  })
})

describe("TC-17: apps/server/README.md's install command points at a script that exists", () => {
  it("the raw.githubusercontent.com/scheron/Daily/main/<path> URL's path resolves against the tree", () => {
    const readme = read("apps/server/README.md")
    const path = extractRawGithubInstallPath(readme)

    expect(
      path,
      "apps/server/README.md should document an install command at https://raw.githubusercontent.com/scheron/Daily/main/<path>",
    ).not.toBeNull()
    if (path) expect(existsSync(join(rootDir, path)), `apps/server/README.md install command path ${path}`).toBe(true)
  })
})
