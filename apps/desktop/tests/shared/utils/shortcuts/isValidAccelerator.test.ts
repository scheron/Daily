import {describe, expect, it} from "vitest"

import {isValidAccelerator} from "@shared/utils/shortcuts/isValidAccelerator"

describe("isValidAccelerator", () => {
  it("accepts modifiers followed by one key", () => {
    expect(isValidAccelerator("Command+Alt+Space")).toBe(true)
    expect(isValidAccelerator("CmdOrCtrl+Enter")).toBe(true)
  })

  it("accepts Control combinations", () => {
    expect(isValidAccelerator("Control+Space")).toBe(true)
    expect(isValidAccelerator("Control+Alt+Space")).toBe(true)
    expect(isValidAccelerator("Control+Shift+A")).toBe(true)
  })

  it("rejects a lone modifier, a bare key and an empty string", () => {
    expect(isValidAccelerator("Command+Alt")).toBe(false)
    expect(isValidAccelerator("Escape")).toBe(false)
    expect(isValidAccelerator("")).toBe(false)
  })
})
