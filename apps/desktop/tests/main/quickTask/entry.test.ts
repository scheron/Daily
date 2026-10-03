// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const calls = vi.hoisted(() => ({configure: vi.fn(), run: vi.fn(), runLoaded: vi.fn(), app: vi.fn()}))

vi.mock("../../../src/main/quickTask/configureQuickTaskApp", () => ({configureQuickTaskApp: calls.configure}))
vi.mock("../../../src/main/quickTask/runQuickTaskProcess", () => {
  calls.runLoaded()
  return {runQuickTaskProcess: calls.run}
})
vi.mock("../../../src/main/app", () => {
  calls.app()
  return {}
})

describe("the main entry", () => {
  const argv = process.argv

  beforeEach(() => {
    vi.resetModules()
    calls.configure.mockClear()
    calls.run.mockClear()
    calls.runLoaded.mockClear()
    calls.app.mockClear()
  })

  afterEach(() => {
    process.argv = argv
  })

  it("runs only the Quick task process, without booting Daily, when the Quick task flag is present", async () => {
    process.argv = [...argv, "--quick-task"]

    await import("../../../src/main/entry")

    expect(calls.configure).toHaveBeenCalledTimes(1)
    expect(calls.run).toHaveBeenCalledTimes(1)
    expect(calls.app).not.toHaveBeenCalled()
  })

  it("boots Daily and leaves the Quick task process alone without the flag", async () => {
    process.argv = argv.filter((arg) => arg !== "--quick-task")

    await import("../../../src/main/entry")

    expect(calls.app).toHaveBeenCalledTimes(1)
    expect(calls.configure).not.toHaveBeenCalled()
    expect(calls.runLoaded).not.toHaveBeenCalled()
  })
})
