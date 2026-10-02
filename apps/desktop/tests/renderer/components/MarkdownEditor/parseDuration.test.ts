import {describe, expect, it} from "vitest"

import {parseDuration} from "../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/parseDuration"

describe("parseDuration", () => {
  it("reads hours and minutes into seconds", () => {
    expect(parseDuration("45m")).toBe(2700)
    expect(parseDuration("2h")).toBe(7200)
    expect(parseDuration("1h30m")).toBe(5400)
  })

  it("rejects anything that is not a positive hours-and-minutes duration", () => {
    expect(parseDuration("")).toBeNull()
    expect(parseDuration("45")).toBeNull()
    expect(parseDuration("0m")).toBeNull()
  })
})
