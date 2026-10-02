// @vitest-environment happy-dom
// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {toAcceleratorKeyCaps} from "../../../../src/renderer/src/utils/shortcuts/toAcceleratorKeyCaps"
import {toShortcutKeys} from "../../../../src/renderer/src/utils/shortcuts/toShortcutKeys"

describe("toAcceleratorKeyCaps", () => {
  let isMac = true

  beforeEach(() => {
    isMac = true
    window.BridgeIPC = {"platform:is-mac": vi.fn(() => isMac)}
  })

  it("shows Control as ⌃ on macOS", () => {
    expect(toAcceleratorKeyCaps("Control+Space")).toEqual(["⌃", "Space"])
    expect(toAcceleratorKeyCaps("Control+Alt+Space")).toEqual(["⌃", "⌥", "Space"])
    expect(toAcceleratorKeyCaps("Control+Shift+A")).toEqual(["⌃", "⇧", "A"])
  })

  it("shows Control as Ctrl elsewhere", () => {
    isMac = false

    expect(toAcceleratorKeyCaps("Control+Shift+A")).toEqual(["Ctrl", "Shift", "A"])
  })

  it("keeps rendering the app's own CmdOrCtrl shortcuts the same", () => {
    expect(toShortcutKeys("ui:open-search-panel")).toBe("⌘ F")
    expect(toShortcutKeys("ui:open-assistant-panel")).toBe("⌘ ⇧ A")

    isMac = false

    expect(toShortcutKeys("ui:open-search-panel")).toBe("Ctrl F")
    expect(toShortcutKeys("ui:open-assistant-panel")).toBe("Ctrl Shift A")
  })
})
