// @ts-nocheck
import {describe, expect, it} from "vitest"

describe("electronPaths", () => {
  it("exposes the AppPaths surface", async () => {
    const mod = await import("../../../src/main/config/electronPaths")
    for (const key of ["appDataRoot", "dbPath", "assetsDir", "remoteSyncPath"]) {
      expect(typeof mod.electronPaths[key]).toBe("function")
    }
  })
})
