// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {readOptions} from "@cli/options"

const fakeCommand = (globals = {}) => ({optsWithGlobals: () => globals})

describe("readOptions", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("merges inherited global options with the action options", () => {
    const merged = readOptions({date: "2026-07-12"}, fakeCommand({json: true}))

    expect(merged.date).toBe("2026-07-12")
    expect(merged.json).toBe(true)
  })

  it("defaults json to true when DAILY_JSON=1", () => {
    vi.stubEnv("DAILY_JSON", "1")

    expect(readOptions({}, fakeCommand()).json).toBe(true)
  })

  it("leaves json unset without the flag and the env", () => {
    expect(readOptions({}, fakeCommand()).json).toBeUndefined()
  })
})
