// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import {useSettingsStore} from "../../../../src/renderer/src/stores/settings.store"
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

  async function setup(focus, settings = {}) {
    bridge = mockBridgeIPC({
      "settings:load": vi.fn().mockResolvedValue({
        appearance: {mode: "system", accent: "default", base: "default"},
        typography: {fontSize: "normal"},
        layout: {sectionsCollapsed: {}},
        branch: {activeId: "main"},
        focus,
        ...settings,
      }),
    })
    wrapper = mount(GeneralSettings, {
      global: {directives: {tooltip: {}}, stubs: {MainColorPicker: true, AccentPicker: true, AboutSection: true, ShortcutsSection: true}},
    })
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

  it("Shortcuts: saves Quick task turned off and hides its shortcut", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})
    const titles = () => wrapper.findAllComponents(SettingRow).map((row) => row.props("title"))
    expect(titles()).toContain("Quick task shortcut")

    await switchIn("Quick task").trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(bridge["settings:save"]).toHaveBeenCalledWith({quickTask: {isEnabled: false}})
    expect(titles()).not.toContain("Quick task shortcut")
  })

  it("Appearance: selects regular by default and saves compact through the existing settings path", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})
    const titles = wrapper.findAllComponents(SettingRow).map((row) => row.props("title"))
    expect(titles).toContain("Interface Size")
    const row = wrapper.findAllComponents(SettingRow).find((row) => row.props("title") === "Interface Size")
    const buttons = row.findAll("button")
    expect(buttons.map((button) => button.text())).toEqual(["Regular", "Compact"])
    expect(buttons[0].classes()).toContain("bg-accent")
    await buttons[1].trigger("click")
    await vi.advanceTimersByTimeAsync(300)
    expect(buttons[1].classes()).toContain("bg-accent")
    expect(bridge["settings:save"]).toHaveBeenCalledWith({appearance: {taskView: "compact"}})
  })

  it("Appearance: restores the saved board view and persists mode changes without changing interface size or collapsed columns", async () => {
    await setup(
      {shouldNotify: true, shouldPlaySound: true},
      {
        appearance: {mode: "system", accent: "default", base: "default", boardMode: "agents", taskView: "compact"},
        layout: {sectionsCollapsed: {backlog: true, done: false}},
      },
    )
    const settingsStore = useSettingsStore()
    const savedSettings = JSON.parse(JSON.stringify(settingsStore.settings))
    const row = wrapper.findAllComponents(SettingRow).find((row) => row.props("title") === "Board View")
    expect(row).toBeDefined()
    const buttons = row.findAll("button")
    expect(buttons.map((button) => button.text())).toEqual(["Default", "Agents"])
    expect(buttons[1].classes()).toContain("bg-accent")

    await buttons[0].trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(settingsStore.settings).toEqual({...savedSettings, appearance: {...savedSettings.appearance, boardMode: "normal"}})
    expect(bridge["settings:save"]).toHaveBeenLastCalledWith({appearance: {boardMode: "normal"}})

    await buttons[1].trigger("click")
    await vi.advanceTimersByTimeAsync(300)

    expect(settingsStore.settings).toEqual(savedSettings)
    expect(bridge["settings:save"]).toHaveBeenLastCalledWith({appearance: {boardMode: "agents"}})
  })

  it("opens with the Appearance group in the agreed row order", async () => {
    await setup({shouldNotify: true, shouldPlaySound: true})

    expect(wrapper.findAllComponents(SettingsGroup)[0].props("label")).toBe("Appearance")
    const titles = wrapper
      .findAllComponents(SettingRow)
      .slice(0, 7)
      .map((r) => r.props("title"))
    expect(titles).toEqual(["Theme", "Shell Color", "Main Color", "Text size", "Interface Size", "Board View", "Show icon in menu bar"])
    const shortcuts = wrapper.findAllComponents(SettingsGroup).find((g) => g.props("label") === "Shortcuts")
    expect(shortcuts.text()).not.toContain("Show icon in menu bar")
  })
})
