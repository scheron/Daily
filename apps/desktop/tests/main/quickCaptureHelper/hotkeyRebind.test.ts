// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {HelperChannel} from "../../../src/main/quickCaptureHelper/HelperChannel"
import {unregisterHotkey} from "../../../src/main/quickCaptureHelper/hotkey"
import {createHotkeyRequestHandler} from "../../../src/main/quickCaptureHelper/hotkeyRequests"
import {setupQuickCaptureIPC} from "../../../src/main/setup/ipc/quickCapture"

const electron = vi.hoisted(() => ({handlers: new Map(), shortcuts: new Map(), taken: new Set()}))

vi.mock("electron", () => ({
  ipcMain: {handle: (channel, handler) => electron.handlers.set(channel, handler)},
  globalShortcut: {
    register: (accelerator, callback) => {
      if (electron.taken.has(accelerator)) return false
      electron.shortcuts.set(accelerator, callback)
      return true
    },
    unregister: (accelerator) => electron.shortcuts.delete(accelerator),
  },
}))
vi.mock("@daily/core", () => ({logger: {error: vi.fn(), CONTEXT: {APP: "APP"}}}))

describe("rebinding the hotkey from Daily's settings through the channel to the helper", () => {
  const onPress = vi.fn()
  let saveSettings = null
  let daily = null
  let helperChannel = null

  beforeEach(() => {
    unregisterHotkey()
    electron.handlers.clear()
    electron.shortcuts.clear()
    electron.taken.clear()
    onPress.mockClear()
    saveSettings = vi.fn().mockResolvedValue(undefined)

    helperChannel = new HelperChannel((line) => daily.receive(line), {onRequest: createHotkeyRequestHandler(onPress), onEvent: vi.fn()})
    daily = new HelperChannel((line) => helperChannel.receive(line), {onRequest: vi.fn(), onEvent: vi.fn()})
    setupQuickCaptureIPC({request: (channel, args) => daily.request(channel, args), whenReady: async () => undefined, isRunning: () => true}, () => ({
      saveSettings,
    }))
  })

  const rebind = (accelerator) => electron.handlers.get("quick-capture:rebind-hotkey")({}, accelerator)
  const active = () => electron.handlers.get("quick-capture:active-hotkey")({})

  it("registers the saved hotkey the helper is told at start", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    expect(await active()).toEqual({running: true, active: "Command+Alt+Space"})
    electron.shortcuts.get("Command+Alt+Space")()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("moves the shortcut in the helper and saves it once in Daily", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    expect(await rebind("Control+Shift+A")).toEqual({ok: true})

    expect([...electron.shortcuts.keys()]).toEqual(["Control+Shift+A"])
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).toHaveBeenCalledWith({quickCapture: {hotkey: "Control+Shift+A"}})
  })

  it("rolls back in the helper and saves nothing when the combination is taken", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])
    electron.taken.add("Control+Shift+A")

    expect(await rebind("Control+Shift+A")).toEqual({ok: false, reason: "unavailable", active: "Command+Alt+Space"})

    expect([...electron.shortcuts.keys()]).toEqual(["Command+Alt+Space"])
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it("answers an invalid accelerator with the shortcut that is really active, and saves nothing", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    expect(await rebind("Space")).toEqual({ok: false, reason: "invalid", active: "Command+Alt+Space"})
    expect(await rebind(42)).toEqual({ok: false, reason: "invalid", active: "Command+Alt+Space"})
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it("answers helper-down, with its own reason, and saves nothing, when the helper is gone", async () => {
    setupQuickCaptureIPC(
      {request: () => Promise.reject(new Error("not running")), whenReady: () => Promise.reject(new Error("not running")), isRunning: () => false},
      () => ({saveSettings}),
    )

    expect(await rebind("Control+Shift+A")).toEqual({ok: false, reason: "helper-down", active: null})
    expect(await active()).toEqual({running: false, active: null})
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it("waits for the helper to be ready before it answers which shortcut is active", async () => {
    let becomeReady = null
    const ready = new Promise((resolve) => (becomeReady = resolve))
    setupQuickCaptureIPC({request: () => Promise.resolve("Command+Alt+Space"), whenReady: () => ready, isRunning: () => true}, () => ({saveSettings}))

    const answer = active()
    await Promise.resolve()
    becomeReady()

    expect(await answer).toEqual({running: true, active: "Command+Alt+Space"})
  })
})
