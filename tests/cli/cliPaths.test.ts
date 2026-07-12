// @ts-nocheck
import {describe, expect, it} from "vitest"

import {cliPaths} from "@shared/config/paths"

describe("cliPaths", () => {
  it("derives macOS paths from HOME without importing electron", () => {
    const home = process.env.HOME
    expect(cliPaths.appDataRoot()).toBe(`${home}/Library/Application Support/Daily`)
    expect(cliPaths.dbPath()).toBe(`${home}/Library/Application Support/Daily/db/daily.sqlite`)
    expect(cliPaths.assetsDir()).toBe(`${home}/Library/Application Support/Daily/assets`)
    expect(cliPaths.mutationSignalPath()).toBe(`${home}/Library/Application Support/Daily/.cli-signal`)
  })
})
