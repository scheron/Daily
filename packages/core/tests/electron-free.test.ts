import {readdirSync, readFileSync, statSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src")

function listFilesRecursively(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const entryPath = join(dir, entry)
    return statSync(entryPath).isDirectory() ? listFilesRecursively(entryPath) : [entryPath]
  })
}

describe("packages/core is electron-free", () => {
  it("TC-10: no file under packages/core/src imports electron", () => {
    const files = listFilesRecursively(srcDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      expect(source, file).not.toMatch(/from\s+["']electron["']/)
      expect(source, file).not.toMatch(/require\(["']electron["']\)/)
    }
  })
})
