// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import QuickTaskHotkey from "../../../../src/renderer/src/ui/views/Settings/{fragments}/GeneralSettings/{fragments}/QuickTaskHotkey.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

const toasts = vi.hoisted(() => ({success: vi.fn(), error: vi.fn()}))
vi.mock("vue-toasts-lite", () => ({toasts}))

describe("QuickTaskHotkey — General settings rebinds the Quick task shortcut", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    toasts.success.mockClear()
    toasts.error.mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function setup(hotkey, rebind, active = hotkey, running = true) {
    let stored = hotkey
    bridge = mockBridgeIPC({
      "platform:is-mac": vi.fn().mockReturnValue(true),
      "quick-task:active-hotkey": vi.fn().mockResolvedValue({running, active}),
      "quick-task:rebind-hotkey": vi.fn(async (accelerator) => {
        const result = await rebind(accelerator)
        if (result.ok) stored = accelerator
        return result
      }),
      "settings:load": vi.fn(async () => ({quickTask: {hotkey: stored}})),
    })
    wrapper = mount(QuickTaskHotkey, {global: {directives: {tooltip: {}}}})
    await flushPromises()
  }

  function press(code, mods, type) {
    window.dispatchEvent(new KeyboardEvent(type, {code, key: code, ...mods}))
  }

  async function record(code, mods) {
    await wrapper.findAll("button")[0].trigger("click")
    press(code, mods, "keydown")
    press(code, mods, "keyup")
    await flushPromises()
  }

  const caps = () => wrapper.findAll("kbd").map((cap) => cap.text())

  it("shows the current shortcut as keycaps", async () => {
    await setup("Command+Alt+Space", vi.fn())

    expect(caps()).toEqual(["⌘", "⌥", "Space"])
  })

  it("shows a Control-based shortcut with its ⌃ keycap", async () => {
    await setup("Control+Alt+Space", vi.fn())

    expect(caps()).toEqual(["⌃", "⌥", "Space"])
  })

  it("records a Control combination", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: true}))

    await record("Space", {ctrlKey: true})

    expect(bridge["quick-task:rebind-hotkey"]).toHaveBeenCalledWith("Control+Space")
    expect(caps()).toEqual(["⌃", "Space"])
  })

  it("rebinds a recorded combination and leaves saving to the main process", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: true}))

    await record("KeyA", {metaKey: true, shiftKey: true})
    await vi.advanceTimersByTimeAsync(300)

    expect(bridge["quick-task:rebind-hotkey"]).toHaveBeenCalledWith("Command+Shift+A")
    expect(caps()).toEqual(["⌘", "⇧", "A"])
    expect(toasts.success).toHaveBeenCalled()
    expect(bridge["settings:save"]).not.toHaveBeenCalled()
  })

  it("keeps the previous shortcut and saves nothing when the combination is taken", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: false, reason: "unavailable", active: "Command+Alt+Space"}))

    await record("KeyA", {metaKey: true, shiftKey: true})
    await wrapper.findAll("button")[0].trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("taken by another app. The previous shortcut is still active"))
    expect(bridge["settings:save"]).not.toHaveBeenCalled()
    expect(caps()).toEqual(["⌘", "⌥", "Space"])
  })

  it("says the shortcut is off when the previous binding could not be restored", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: false, reason: "unavailable", active: null}))

    await record("KeyA", {metaKey: true, shiftKey: true})
    await wrapper.findAll("button")[0].trigger("click")

    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("no active shortcut"))
    expect(wrapper.text()).toContain("Not active")
  })

  it("reports an invalid combination without claiming it is taken", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: false, reason: "invalid", active: "Command+Alt+Space"}))

    await record("KeyA", {metaKey: true, shiftKey: true})

    expect(toasts.error).toHaveBeenCalledWith(expect.not.stringContaining("taken"))
  })

  it("shows the saved shortcut as not active when it failed to register at launch", async () => {
    await setup("Command+Alt+Space", vi.fn(), null)

    expect(wrapper.text()).toContain("Not active")
  })

  it("says Quick task is not running, not that another app has the shortcut, when the Quick task process is down at open", async () => {
    await setup("Command+Alt+Space", vi.fn(), null, false)

    expect(wrapper.text()).toContain("Quick task is not running")
    expect(wrapper.text()).not.toContain("another app")
  })

  it("says Quick task is not running when a rebind finds the Quick task process down", async () => {
    await setup("Command+Alt+Space", vi.fn().mockResolvedValue({ok: false, reason: "not-running", active: null}))

    await record("KeyA", {metaKey: true, shiftKey: true})
    await wrapper.findAll("button")[0].trigger("click")

    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("Quick task is not running"))
    expect(toasts.error).toHaveBeenCalledWith(expect.not.stringContaining("taken"))
    expect(wrapper.text()).toContain("Quick task is not running")
  })

  it("does not warn when the saved shortcut is active", async () => {
    await setup("Command+Alt+Space", vi.fn())

    expect(wrapper.text()).not.toContain("Not active")
  })

  it("resets to the default shortcut", async () => {
    await setup("Control+Shift+A", vi.fn().mockResolvedValue({ok: true}))

    await wrapper.findAll("button")[1].trigger("click")
    await flushPromises()

    expect(bridge["quick-task:rebind-hotkey"]).toHaveBeenCalledWith("Command+Alt+Space")
    expect(caps()).toEqual(["⌘", "⌥", "Space"])
  })
})
