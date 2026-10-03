// @ts-nocheck
import {EventEmitter} from "node:events"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {runQuickTaskProcess} from "../../../src/main/quickTask/runQuickTaskProcess"

const mocks = vi.hoisted(() => ({
  appHandlers: new Map(),
  app: {quit: vi.fn(), on: vi.fn(), dock: {hide: vi.fn()}, whenReady: vi.fn()},
  panel: null,
  menu: null,
  setupPanelIpc: vi.fn(),
}))

vi.mock("electron", () => ({app: mocks.app}))
vi.mock("@main/windows/quickTask.window", () => ({createQuickTaskWindow: () => mocks.panel, toggleQuickTask: vi.fn()}))
vi.mock("@main/windows/quickTaskMenu.window", () => ({createQuickTaskMenuWindow: () => mocks.menu}))
vi.mock("../../../src/main/quickTask/panelIpc", () => ({setupPanelIpc: mocks.setupPanelIpc}))
vi.mock("../../../src/main/quickTask/hotkey", () => ({
  unregisterHotkey: vi.fn(),
  registerHotkey: vi.fn(),
  rebindHotkey: vi.fn(),
  getActiveHotkey: vi.fn(),
}))

function fakeWindow() {
  return Object.assign(new EventEmitter(), {isDestroyed: () => false, destroy: vi.fn(), webContents: {send: vi.fn()}})
}

describe("the Quick task process process", () => {
  let stdin = null
  let stdout = null
  let ready = null

  beforeEach(() => {
    Object.values(mocks.app).forEach((fn) => fn.mockClear?.())
    mocks.app.dock.hide.mockClear()
    mocks.setupPanelIpc.mockClear()
    mocks.panel = fakeWindow()
    mocks.menu = fakeWindow()
    stdin = Object.assign(new EventEmitter(), {setEncoding: vi.fn()})
    stdout = Object.assign(new EventEmitter(), {write: vi.fn()})
    ready = Promise.resolve()
    mocks.app.whenReady.mockReturnValue(ready)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    runQuickTaskProcess({stdin, stdout})
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
    expect(mocks.setupPanelIpc).toHaveBeenCalled()
    expect(stdout.write).toHaveBeenCalledWith(line({kind: "event", channel: "process:ready", args: []}))
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
