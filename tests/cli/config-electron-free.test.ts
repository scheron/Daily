// @ts-nocheck
import {readdirSync, readFileSync} from "node:fs"
import {join} from "node:path"
import {describe, expect, it} from "vitest"

const ROOT = join(__dirname, "..", "..")

describe("config is electron-free", () => {
  it("no file in src/shared/config imports electron", () => {
    const dir = join(ROOT, "src/shared/config")
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), "utf8")
      expect(src, file).not.toMatch(/from ["']electron["']/)
      expect(src, file).not.toMatch(/\bfsPaths\b/)
    }
  })

  it("electronPaths exposes the AppPaths surface", async () => {
    const mod = await import("@main/runtime/electronPaths")
    for (const key of ["appDataRoot", "dbPath", "assetsDir", "remoteSyncPath", "mutationSignalPath"]) {
      expect(typeof mod.electronPaths[key]).toBe("function")
    }
  })
})
