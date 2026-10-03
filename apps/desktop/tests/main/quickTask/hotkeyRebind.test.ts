// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {createHotkeyRequestHandler, unregisterHotkey} from "../../../src/main/quickTask/hotkey"
import {StdioChannel} from "../../../src/main/quickTask/StdioChannel"
import {setupQuickTaskIPC} from "../../../src/main/setup/ipc/quickTask"

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

describe("rebinding the hotkey from Daily's settings through the channel to the Quick task process", () => {
  const onPress = vi.fn()
  let saveSettings = null
  let daily = null
  let quickTaskChannel = null

  beforeEach(() => {
    unregisterHotkey()
    electron.handlers.clear()
    electron.shortcuts.clear()
    electron.taken.clear()
    onPress.mockClear()
    saveSettings = vi.fn().mockResolvedValue(undefined)

    quickTaskChannel = new StdioChannel((line) => daily.receive(line), {onRequest: createHotkeyRequestHandler(onPress), onEvent: vi.fn()})
    daily = new StdioChannel((line) => quickTaskChannel.receive(line), {onRequest: vi.fn(), onEvent: vi.fn()})
    setupQuickTaskIPC({request: (channel, args) => daily.request(channel, args), whenReady: async () => undefined, isRunning: () => true}, () => ({
      loadSettings: async () => ({quickTask: {isEnabled: true, hotkey: "Command+Alt+Space"}}),
      saveSettings,
    }))
  })

  const rebind = (accelerator) => electron.handlers.get("quick-task:rebind-hotkey")({}, accelerator)
  const active = () => electron.handlers.get("quick-task:active-hotkey")({})

  it("registers the saved hotkey the Quick task process is told at start", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    expect(await active()).toEqual({running: true, active: "Command+Alt+Space"})
    electron.shortcuts.get("Command+Alt+Space")()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("toggles the panel on a request from Daily exactly as a press of the registered shortcut does", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    electron.shortcuts.get("Command+Alt+Space")()
    await daily.request("panel:toggle", [])

    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it("moves the shortcut in the Quick task process and saves it once in Daily, keeping Quick task on", async () => {
    await daily.request("hotkey:register", ["Command+Alt+Space"])

    expect(await rebind("Control+Shift+A")).toEqual({ok: true})

    expect([...electron.shortcuts.keys()]).toEqual(["Control+Shift+A"])
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).toHaveBeenCalledWith({quickTask: {isEnabled: true, hotkey: "Control+Shift+A"}})
  })

  it("rolls back in the Quick task process and saves nothing when the combination is taken", async () => {
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

  it("answers not-running, with its own reason, and saves nothing, when the Quick task process is gone", async () => {
    setupQuickTaskIPC(
      {request: () => Promise.reject(new Error("not running")), whenReady: () => Promise.reject(new Error("not running")), isRunning: () => false},
      () => ({saveSettings}),
    )

    expect(await rebind("Control+Shift+A")).toEqual({ok: false, reason: "not-running", active: null})
    expect(await active()).toEqual({running: false, active: null})
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it("waits for the Quick task process to be ready before it answers which shortcut is active", async () => {
    let becomeReady = null
    const ready = new Promise((resolve) => (becomeReady = resolve))
    setupQuickTaskIPC({request: () => Promise.resolve("Command+Alt+Space"), whenReady: () => ready, isRunning: () => true}, () => ({saveSettings}))

    const answer = active()
    await Promise.resolve()
    becomeReady()

    expect(await answer).toEqual({running: true, active: "Command+Alt+Space"})
  })
})
