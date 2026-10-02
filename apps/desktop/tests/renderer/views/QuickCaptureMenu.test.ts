// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {DOMWrapper, flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const SRC = "../../../src/renderer/src"

describe("the Quick Capture menu window view", () => {
  let bridge = null
  let wrapper = null
  let pushMenu = null

  beforeEach(async () => {
    bridge = mockBridgeIPC({
      "quick-capture-menu:on-menu": vi.fn((callback) => {
        pushMenu = callback
        return vi.fn()
      }),
      "quick-capture-menu:resize": vi.fn(),
      "quick-capture-menu:pick": vi.fn(),
    })
    setActivePinia(createPinia())
    const {useSettingsStore} = await import(`${SRC}/stores/settings.store`)
    await useSettingsStore().revalidate()
    const {default: QuickCaptureMenu} = await import(`${SRC}/ui/views/QuickCaptureMenu/QuickCaptureMenu.vue`)
    wrapper = mount(QuickCaptureMenu, {attachTo: document.body})
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    pushMenu = null
    document.body.innerHTML = ""
  })

  function rows() {
    return [...document.body.querySelectorAll("li")].map((row) => new DOMWrapper(row))
  }

  const MENU = {
    rows: [
      {label: "Divider", icon: "minus"},
      {label: "work", color: "#ff0000"},
      {label: "home", color: "#00ff00", tone: "remove"},
    ],
    selected: 1,
    caretX: 10,
  }

  it("signals the window ready once mounted and draws nothing until it gets a menu", () => {
    expect(bridge.send).toHaveBeenCalledWith("window:ready")
    expect(rows()).toEqual([])
  })

  it("draws the editor's rows: icon rows, tag chips with their colour, and the selected one marked", async () => {
    pushMenu(MENU)
    await flushPromises()

    const drawn = rows()
    expect(drawn.map((row) => row.text())).toEqual(["Divider", "work", "home"])
    expect(drawn[0].find(".cm-slash-option-icon use").attributes("href")).toBe("#minus")
    expect(drawn[1].find(".cm-tag-option-chip").attributes("style")).toContain("--tag-color: #ff0000")
    expect(drawn[2].classes()).toContain("cm-tag-option-remove")
    expect(drawn.map((row) => row.attributes("aria-selected"))).toEqual([undefined, "true", undefined])
  })

  it("draws no icon for a row that has neither an icon nor a colour", async () => {
    pushMenu({rows: [{label: "Plain"}], selected: 0, caretX: 0})
    await flushPromises()

    expect(rows()[0].text()).toBe("Plain")
    expect(rows()[0].find("use").exists()).toBe(false)
  })

  it("reports its height to the main process each time it gets a menu", async () => {
    pushMenu(MENU)
    await flushPromises()

    expect(bridge["quick-capture-menu:resize"]).toHaveBeenCalledTimes(1)
    expect(bridge["quick-capture-menu:resize"]).toHaveBeenCalledWith(expect.any(Number))
  })

  it("sends the clicked row's index back and keeps the click from taking focus", async () => {
    pushMenu(MENU)
    await flushPromises()

    const mousedown = new MouseEvent("mousedown", {bubbles: true, cancelable: true})
    rows()[2].element.dispatchEvent(mousedown)
    await rows()[2].trigger("click")

    expect(mousedown.defaultPrevented).toBe(true)
    expect(bridge["quick-capture-menu:pick"]).toHaveBeenCalledWith(2)
  })

  it("draws nothing once the menu closes", async () => {
    pushMenu(MENU)
    await flushPromises()

    pushMenu(null)
    await flushPromises()

    expect(rows()).toEqual([])
  })
})
