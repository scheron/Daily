// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {getActiveHotkey, rebindHotkey, registerHotkey, unregisterHotkey} from "../../../src/main/quickCaptureHelper/hotkey"

const shortcuts = vi.hoisted(() => ({taken: new Set(), registered: new Map()}))

vi.mock("electron", () => ({
  globalShortcut: {
    register: (accelerator, callback) => {
      if (shortcuts.taken.has(accelerator)) return false
      shortcuts.registered.set(accelerator, callback)
      return true
    },
    unregister: (accelerator) => shortcuts.registered.delete(accelerator),
  },
}))
vi.mock("@daily/core", () => ({logger: {error: vi.fn(), CONTEXT: {APP: "APP"}}}))

describe("the Quick Capture hotkey in the helper", () => {
  const onPress = vi.fn()

  beforeEach(() => {
    unregisterHotkey()
    shortcuts.taken.clear()
    shortcuts.registered.clear()
    onPress.mockClear()
  })

  it("runs the handler when the shortcut fires", () => {
    registerHotkey("Command+Alt+Space", onPress)

    shortcuts.registered.get("Command+Alt+Space")()

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("refuses an accelerator without a modifier", () => {
    expect(registerHotkey("Space", onPress)).toBe(false)
    expect(shortcuts.registered.size).toBe(0)
  })

  it("moves the binding when the new combination registers", () => {
    registerHotkey("Command+Alt+Space", onPress)

    expect(rebindHotkey("Control+Shift+A", onPress)).toEqual({ok: true})
    expect([...shortcuts.registered.keys()]).toEqual(["Control+Shift+A"])
  })

  it("restores the previous binding when the combination is taken", () => {
    registerHotkey("Command+Alt+Space", onPress)
    shortcuts.taken.add("Control+Shift+A")

    expect(rebindHotkey("Control+Shift+A", onPress)).toEqual({ok: false, reason: "unavailable", active: "Command+Alt+Space"})
    expect([...shortcuts.registered.keys()]).toEqual(["Command+Alt+Space"])
  })

  it("reports no active shortcut when the previous binding cannot be restored either", () => {
    registerHotkey("Command+Alt+Space", onPress)
    shortcuts.taken.add("Control+Shift+A")
    shortcuts.taken.add("Command+Alt+Space")

    expect(rebindHotkey("Control+Shift+A", onPress)).toEqual({ok: false, reason: "unavailable", active: null})
    expect(getActiveHotkey()).toBeNull()
  })

  it("rejects an invalid accelerator without touching the binding", () => {
    registerHotkey("Command+Alt+Space", onPress)

    expect(rebindHotkey("Space", onPress)).toEqual({ok: false, reason: "invalid", active: "Command+Alt+Space"})
    expect(getActiveHotkey()).toBe("Command+Alt+Space")
  })

  it("reports no active shortcut when the saved one never registered", () => {
    shortcuts.taken.add("Command+Alt+Space")

    expect(registerHotkey("Command+Alt+Space", onPress)).toBe(false)
    expect(getActiveHotkey()).toBeNull()
  })
})
