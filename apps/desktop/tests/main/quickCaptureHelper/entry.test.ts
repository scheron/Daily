// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const calls = vi.hoisted(() => ({configure: vi.fn(), run: vi.fn(), runLoaded: vi.fn(), app: vi.fn()}))

vi.mock("../../../src/main/quickCaptureHelper/configureHelperApp", () => ({configureHelperApp: calls.configure}))
vi.mock("../../../src/main/quickCaptureHelper/runQuickCaptureHelper", () => {
  calls.runLoaded()
  return {runQuickCaptureHelper: calls.run}
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

  it("runs only the helper, without booting Daily, when the helper flag is present", async () => {
    process.argv = [...argv, "--quick-capture-helper"]

    await import("../../../src/main/entry")

    expect(calls.configure).toHaveBeenCalledTimes(1)
    expect(calls.run).toHaveBeenCalledTimes(1)
    expect(calls.app).not.toHaveBeenCalled()
  })

  it("boots Daily and leaves the helper alone without the flag", async () => {
    process.argv = argv.filter((arg) => arg !== "--quick-capture-helper")

    await import("../../../src/main/entry")

    expect(calls.app).toHaveBeenCalledTimes(1)
    expect(calls.configure).not.toHaveBeenCalled()
    expect(calls.runLoaded).not.toHaveBeenCalled()
  })
})
