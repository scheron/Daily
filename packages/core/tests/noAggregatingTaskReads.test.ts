import {existsSync, readdirSync, readFileSync, statSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

/**
 * TC-23 · US-1 · gate-b: N/A
 * given: the repository after this plan
 * when: `getDays`, `getDay`, `getBacklog` and `getTasksByMilestone` are searched for across
 * `packages/core`, `apps/desktop/src/main` and the renderer's api surface
 * then: none of them is defined or called anywhere, and `DaysService.ts` does not exist
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const coreSrcDir = join(repoRoot, "packages/core/src")
const mainSrcDir = join(repoRoot, "apps/desktop/src/main")
const rendererApiDir = join(repoRoot, "apps/desktop/src/renderer/src/api")

function listFilesRecursively(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const entryPath = join(dir, entry)
    return statSync(entryPath).isDirectory() ? listFilesRecursively(entryPath) : [entryPath]
  })
}

const BANNED: Array<{name: string; pattern: RegExp}> = [
  {name: "getDays", pattern: /\bgetDays\b/},
  {name: "getDay", pattern: /\bgetDay\b/},
  {name: "getBacklog", pattern: /\bgetBacklog\b/},
  {name: "getTasksByMilestone", pattern: /\bgetTasksByMilestone\b/},
]

describe("no aggregating task read is left after this plan", () => {
  it("finds_TC-23_no_definition_or_call_of_the_four_removed_reads_and_no_DaysService_file", () => {
    const files = [coreSrcDir, mainSrcDir, rendererApiDir]
      .flatMap(listFilesRecursively)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".vue"))

    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      for (const {name, pattern} of BANNED) {
        if (pattern.test(source)) offenders.push(`${file}: ${name}`)
      }
    }

    expect(offenders).toEqual([])
    expect(existsSync(join(coreSrcDir, "storage/services/DaysService.ts"))).toBe(false)
  })
})
