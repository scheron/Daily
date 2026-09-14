// @ts-nocheck
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest"

const {resolveLatestRelease} = vi.hoisted(() => ({resolveLatestRelease: vi.fn()}))

vi.mock("electron", () => ({
  app: {getVersion: () => "1.0.0", getPath: () => "/tmp", quit: vi.fn()},
}))

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {UPDATES: "UPDATES"}},
}))

vi.mock("../../../src/main/updates/release", () => ({
  resolveLatestRelease,
  downloadRelease: vi.fn(),
}))

vi.mock("../../../src/main/updates/utils/applyPendingInstallResult", () => ({
  applyPendingInstallResult: vi.fn().mockResolvedValue(undefined),
}))

const {UpdaterController} = await import("../../../src/main/updates/UpdaterController")

const originalPlatform = process.platform

function createWindow() {
  return {isDestroyed: () => false, webContents: {send: vi.fn()}}
}

function emittedStates(window: ReturnType<typeof createWindow>) {
  return window.webContents.send.mock.calls.filter(([channel]) => channel === "updates:state-changed").map(([, state]) => state)
}

describe("UpdaterController — a check that cannot reach GitHub", () => {
  beforeAll(() => {
    Object.defineProperty(process, "platform", {value: "darwin"})
  })

  afterAll(() => {
    Object.defineProperty(process, "platform", {value: originalPlatform})
  })

  beforeEach(() => {
    resolveLatestRelease.mockReset().mockRejectedValue(new TypeError("fetch failed"))
  })

  it("reports no reason when the startup check fails, so nothing is toasted", async () => {
    const controller = new UpdaterController()
    const window = createWindow()
    controller.setMainWindow(window)

    await controller.initialize()

    const errorStates = emittedStates(window).filter((state) => state.status === "error")
    expect(errorStates).not.toHaveLength(0)
    expect(errorStates.map((state) => state.reason)).toEqual(errorStates.map(() => null))
  })

  it("still reports the failure when the check was requested by hand", async () => {
    const controller = new UpdaterController()
    const window = createWindow()
    controller.setMainWindow(window)

    const state = await controller.checkForUpdate({manual: true})

    expect(state).toMatchObject({status: "error", reason: "fetch failed"})
    expect(emittedStates(window).at(-1)).toMatchObject({status: "error", reason: "fetch failed"})
  })
})
