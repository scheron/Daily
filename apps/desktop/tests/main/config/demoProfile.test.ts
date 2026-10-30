import {describe, expect, it} from "vitest"

import {resolveAppProfile} from "../../../src/main/demo/profile"

describe("demo profile isolation", () => {
  it("never shares storage, sync folders, or build output with a regular profile", () => {
    for (const isDevelopment of [false, true]) {
      const regular = resolveAppProfile(false, isDevelopment)
      const demo = resolveAppProfile(true, isDevelopment)

      expect(demo.name).toBe("Daily Demo")
      expect(demo.dataDirectory).toBe("Daily-Demo")
      expect(demo.dataDirectory).not.toBe(regular.dataDirectory)
      expect(demo.syncDirectory).not.toBe(regular.syncDirectory)
      expect(demo.outputDirectory).not.toBe(regular.outputDirectory)
    }
  })

  it("keeps regular release and development profiles unchanged", () => {
    expect(resolveAppProfile(false, false)).toMatchObject({name: "Daily", dataDirectory: "Daily", outputDirectory: "out", syncDirectory: "Daily"})
    expect(resolveAppProfile(false, true)).toMatchObject({
      name: "Daily",
      dataDirectory: "Daily-dev",
      outputDirectory: "out",
      syncDirectory: "Daily-dev",
    })
  })
})
