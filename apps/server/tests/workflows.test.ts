import {existsSync, readdirSync, readFileSync, statSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const WORKFLOW_FILES = readdirSync(join(rootDir, ".github/workflows"))
  .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
  .sort()
  .map((entry) => `.github/workflows/${entry}`)

const FORBIDDEN_SRC_ROOTS = ["main", "renderer", "shared"]

const PNPM_META_SUBCOMMANDS = new Set([
  "install",
  "store",
  "exec",
  "add",
  "remove",
  "dlx",
  "create",
  "list",
  "outdated",
  "update",
  "why",
  "link",
  "unlink",
  "rebuild",
  "patch",
  "publish",
  "pack",
  "prune",
  "import",
  "audit",
  "licenses",
  "deploy",
  "config",
  "env",
  "root",
  "bin",
  "ls",
])

type PnpmInvocation = {filterTarget: string | null; script: string}

function readWorkflow(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), "utf-8")
}

function hasBareSrcRoot(text: string, root: string): boolean {
  return new RegExp(`(?<![\\w/])src/${root}\\b`).test(text)
}

function extractRunStepBodies(text: string): string[] {
  const lines = text.split("\n")
  const bodies: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i])
    if (!match) continue

    const [, indent, inline] = match
    if (inline.trim() && !/^[|>][-+]?$/.test(inline.trim())) {
      bodies.push(inline.trim())
      continue
    }

    const blockLines: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") {
        blockLines.push("")
        continue
      }
      const nextIndent = /^(\s*)/.exec(lines[j])?.[1].length ?? 0
      if (nextIndent <= indent.length) break
      blockLines.push(lines[j])
    }
    bodies.push(blockLines.join("\n"))
  }

  return bodies
}

function extractRunBodies(text: string): string {
  return extractRunStepBodies(text).join("\n")
}

function extractProjectPaths(text: string): string[] {
  return [...extractRunBodies(text).matchAll(/--project\s+(\S+)/g)].map((match) => match[1])
}

function extractNodeScriptInvocations(text: string): string[] {
  return [...extractRunBodies(text).matchAll(/\bnode\s+(scripts\/[\w.-]+\.js)/g)].map((match) => match[1])
}

function extractWorkingDirectories(text: string): string[] {
  return [...text.matchAll(/working-directory:\s*([^\s]+)/g)].map((match) => match[1])
}

function extractCacheDependencyPaths(text: string): string[] {
  return [...text.matchAll(/cache-dependency-path:\s*['"]?([^'"\s]+)['"]?/g)].map((match) => match[1])
}

function extractTriggerPathPrefixes(text: string): string[] {
  const block = /paths:\s*\n((?:\s*-\s*['"][^'"]*['"]\s*\n?)+)/.exec(text)
  if (!block) return []

  return [...block[1].matchAll(/-\s*['"]([^'"]+)['"]/g)].map((match) => match[1].replace(/\/?\*+$/, ""))
}

function extractPnpmInvocations(text: string): PnpmInvocation[] {
  const matches = [...extractRunBodies(text).matchAll(/\bpnpm\s+(?:run\s+)?(?:--filter\s+(\S+)\s+)?([a-zA-Z][\w:.-]*)/g)]

  return matches.map((match) => ({filterTarget: match[1] ?? null, script: match[2]})).filter(({script}) => !PNPM_META_SUBCOMMANDS.has(script))
}

function workspacePackageDirs(): Map<string, string> {
  const dirs = new Map<string, string>()

  for (const group of ["apps", "packages"]) {
    const groupPath = join(rootDir, group)
    for (const entry of readdirSync(groupPath)) {
      const entryPath = join(groupPath, entry)
      const manifestPath = join(entryPath, "package.json")
      if (statSync(entryPath).isDirectory() && existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {name: string}
        dirs.set(manifest.name, entryPath)
      }
    }
  }

  return dirs
}

function declaresScript(pkgDir: string, script: string): boolean {
  const manifestPath = join(pkgDir, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {scripts?: Record<string, string>}
  return Boolean(manifest.scripts?.[script])
}

function extractScriptCiInvocations(body: string): string[] {
  return [...body.matchAll(/\bscripts\/ci\/([\w.-]+\.sh)\b/g)].map((match) => match[1])
}

describe("workflow files reference paths, scripts and targets that exist", () => {
  const packageDirs = workspacePackageDirs()

  it.each(WORKFLOW_FILES)("TC-8: %s exists", (relativePath) => {
    expect(existsSync(join(rootDir, relativePath))).toBe(true)
  })

  it.each(WORKFLOW_FILES)("TC-8: %s names no pre-split src/ path and no top-level website/ path", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const root of FORBIDDEN_SRC_ROOTS) {
      expect(hasBareSrcRoot(workflow, root), `${relativePath} should not reference the pre-split src/${root}`).toBe(false)
    }

    for (const match of workflow.matchAll(/website\//g)) {
      const precededByApps = workflow.slice(Math.max(0, match.index - 5), match.index) === "apps/"
      expect(precededByApps, `${relativePath} references a top-level website/ path at offset ${match.index}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every --project path %s declares resolves against the tree", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const projectPath of extractProjectPaths(workflow)) {
      expect(existsSync(join(rootDir, projectPath)), `${relativePath} --project ${projectPath}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every node scripts/*.js invocation in %s names a script that exists", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const scriptPath of extractNodeScriptInvocations(workflow)) {
      expect(existsSync(join(rootDir, scriptPath)), `${relativePath} node ${scriptPath}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every working-directory in %s resolves against the tree", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const dir of extractWorkingDirectories(workflow)) {
      expect(existsSync(join(rootDir, dir)), `${relativePath} working-directory ${dir}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every cache-dependency-path in %s resolves against the tree", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const path of extractCacheDependencyPaths(workflow)) {
      expect(existsSync(join(rootDir, path)), `${relativePath} cache-dependency-path ${path}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every push-trigger path prefix in %s resolves against the tree", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const prefix of extractTriggerPathPrefixes(workflow)) {
      expect(existsSync(join(rootDir, prefix)), `${relativePath} trigger path ${prefix}`).toBe(true)
    }
  })

  it.each(WORKFLOW_FILES)("TC-8: every pnpm run <name> and --filter target in %s names a declared script", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const {filterTarget, script} of extractPnpmInvocations(workflow)) {
      if (filterTarget) {
        const pkgDir = packageDirs.get(filterTarget)
        expect(pkgDir, `${relativePath} filters an unknown workspace package ${filterTarget}`).toBeTruthy()
        if (pkgDir) expect(declaresScript(pkgDir, script), `${relativePath} ${filterTarget} has no "${script}" script`).toBe(true)
      } else {
        expect(declaresScript(rootDir, script), `${relativePath} root package.json has no "${script}" script`).toBe(true)
      }
    }
  })
})

describe("workflow run: steps carry no inline scripts", () => {
  it.each(WORKFLOW_FILES)("no run: step in %s spans more than one line of shell logic", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const body of extractRunStepBodies(workflow)) {
      const meaningfulLines = body
        .trim()
        .split("\n")
        .filter((line) => line.trim() !== "")

      expect(meaningfulLines.length, `${relativePath} has a run: step with inline shell logic:\n${body.trim()}`).toBeLessThanOrEqual(1)
    }
  })

  it.each(WORKFLOW_FILES)("every scripts/ci/ invocation in %s names a script that exists", (relativePath) => {
    const workflow = readWorkflow(relativePath)

    for (const body of extractRunStepBodies(workflow)) {
      for (const scriptName of extractScriptCiInvocations(body)) {
        expect(existsSync(join(rootDir, "scripts/ci", scriptName)), `${relativePath} scripts/ci/${scriptName}`).toBe(true)
      }
    }
  })
})
