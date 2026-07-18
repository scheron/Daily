// @ts-nocheck
import {describe, expect, it} from "vitest"

import {toTaskIdHash} from "@shared/utils/tasks/toTaskIdHash"

describe("toTaskIdHash", () => {
  it("returns the final six characters of a task ID", () => {
    expect(toTaskIdHash("tgYAT0g33lAVOWNooneHz")).toBe("ooneHz")
  })
})
