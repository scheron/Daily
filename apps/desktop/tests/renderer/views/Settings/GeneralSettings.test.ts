// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import GeneralSettings from "../../../../src/renderer/src/ui/views/Settings/{fragments}/GeneralSettings/GeneralSettings.vue"
import SettingRow from "../../../../src/renderer/src/ui/views/Settings/{fragments}/SettingRow.vue"
import SettingsGroup from "../../../../src/renderer/src/ui/views/Settings/{fragments}/SettingsGroup.vue"
import BaseSwitch from "../../../../src/renderer/src/ui/base/BaseSwitch.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

describe("GeneralSettings", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function setup(focus) {
    bridge = mockBridgeIPC({
      "settings:load": vi.fn().mockResolvedValue({
        appearance: {mode: "system", accent: "default", base: "default"},
        typography: {fontSize: "normal"},
        layout: {sectionsCollapsed: {}},
        branch: {activeId: "main"},
        focus,
      }),
    })
    wrapper = mount(GeneralSettings, {global: {stubs: {MainColorPicker: true, AccentPicker: true, AboutSection: true, ShortcutsSection: true}}})
    await flushPromises()
  }

  function switchIn(title) {
    return wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props("title") === title)
      .findComponent(BaseSwitch)
  }

  it("Focus: saves notifications turned off", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})

    await switchIn("Notifications").trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(bridge["settings:save"]).toHaveBeenCalledWith({focus: {shouldNotify: false}})
  })

  it("Focus: saves the sound turned off while notifications stay on", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})

    await switchIn("Sound").trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(bridge["settings:save"]).toHaveBeenCalledWith({focus: {shouldPlaySound: false}})
  })

  it("Focus: holds the sound switch still while notifications are off", async () => {
    await setup({shouldNotify: false, shouldPlaySound: true})

    const sound = switchIn("Sound")
    await sound.trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(sound.props("disabled")).toBe(true)
    expect(bridge["settings:save"]).not.toHaveBeenCalled()
  })

  it("opens with the Appearance group in the agreed row order", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})

    expect(wrapper.findAllComponents(SettingsGroup)[0].props("label")).toBe("Appearance")
    const titles = wrapper
      .findAllComponents(SettingRow)
      .slice(0, 5)
      .map((r) => r.props("title"))
    expect(titles).toEqual(["Theme", "Shell Color", "Main Color", "Text size", "Show icon in menu bar"])
    const shortcuts = wrapper.findAllComponents(SettingsGroup).find((g) => g.props("label") === "Shortcuts")
    expect(shortcuts.text()).not.toContain("Show icon in menu bar")
  })
})
