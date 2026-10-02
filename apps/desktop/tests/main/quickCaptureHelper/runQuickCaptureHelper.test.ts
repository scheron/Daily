// @ts-nocheck
import {EventEmitter} from "node:events"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {runQuickCaptureHelper} from "../../../src/main/quickCaptureHelper/runQuickCaptureHelper"

const mocks = vi.hoisted(() => ({
  appHandlers: new Map(),
  app: {quit: vi.fn(), on: vi.fn(), dock: {hide: vi.fn()}, whenReady: vi.fn()},
  panel: null,
  menu: null,
  setupHelperIpc: vi.fn(),
}))

vi.mock("electron", () => ({app: mocks.app}))
vi.mock("@main/windows/quickCapture.window", () => ({createQuickCaptureWindow: () => mocks.panel, toggleQuickCapture: vi.fn()}))
vi.mock("@main/windows/quickCaptureMenu.window", () => ({createQuickCaptureMenuWindow: () => mocks.menu}))
vi.mock("../../../src/main/quickCaptureHelper/helperIpc", () => ({setupHelperIpc: mocks.setupHelperIpc}))
vi.mock("../../../src/main/quickCaptureHelper/hotkey", () => ({
  unregisterHotkey: vi.fn(),
  registerHotkey: vi.fn(),
  rebindHotkey: vi.fn(),
  getActiveHotkey: vi.fn(),
}))

function fakeWindow() {
  return Object.assign(new EventEmitter(), {isDestroyed: () => false, destroy: vi.fn(), webContents: {send: vi.fn()}})
}

describe("the helper process", () => {
  let stdin = null
  let stdout = null
  let ready = null

  beforeEach(() => {
    Object.values(mocks.app).forEach((fn) => fn.mockClear?.())
    mocks.app.dock.hide.mockClear()
    mocks.setupHelperIpc.mockClear()
    mocks.panel = fakeWindow()
    mocks.menu = fakeWindow()
    stdin = Object.assign(new EventEmitter(), {setEncoding: vi.fn()})
    stdout = Object.assign(new EventEmitter(), {write: vi.fn()})
    ready = Promise.resolve()
    mocks.app.whenReady.mockReturnValue(ready)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    runQuickCaptureHelper({stdin, stdout})
  })

  const line = (message) => JSON.stringify(message) + "\n"

  it("quits when Daily closes its end of the channel", () => {
    stdin.emit("end")

    expect(mocks.app.quit).toHaveBeenCalledTimes(1)
  })

  it("quits quietly when writing to Daily fails because Daily is gone", () => {
    expect(() => stdout.emit("error", Object.assign(new Error("write EPIPE"), {code: "EPIPE"}))).not.toThrow()

    expect(mocks.app.quit).toHaveBeenCalledTimes(1)
  })

  it("hides its Dock icon and tells Daily it is ready once Electron is", async () => {
    await ready
    await Promise.resolve()

    expect(mocks.app.dock.hide).toHaveBeenCalled()
    expect(mocks.setupHelperIpc).toHaveBeenCalled()
    expect(stdout.write).toHaveBeenCalledWith(line({kind: "event", channel: "helper:ready", args: []}))
  })

  it("re-emits a whitelisted Daily event to the panel and the menu windows", async () => {
    await ready
    await Promise.resolve()

    stdin.emit("data", line({kind: "event", channel: "settings:changed", args: [{a: 1}]}))

    expect(mocks.panel.webContents.send).toHaveBeenCalledWith("settings:changed", {a: 1})
    expect(mocks.menu.webContents.send).toHaveBeenCalledWith("settings:changed", {a: 1})
  })

  it("drops an event that is not on the whitelist", async () => {
    await ready
    await Promise.resolve()

    stdin.emit("data", line({kind: "event", channel: "ai:event", args: []}))

    expect(mocks.panel.webContents.send).not.toHaveBeenCalled()
    expect(mocks.menu.webContents.send).not.toHaveBeenCalled()
  })

  it("keeps running when its windows close", () => {
    const [, onAllClosed] = mocks.app.on.mock.calls.find(([name]) => name === "window-all-closed")

    expect(() => onAllClosed()).not.toThrow()
    expect(mocks.app.quit).not.toHaveBeenCalled()
  })
})
