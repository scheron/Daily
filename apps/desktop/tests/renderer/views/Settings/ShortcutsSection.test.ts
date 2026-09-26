// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import ShortcutsSection from "../../../../src/renderer/src/ui/views/Settings/{fragments}/GeneralSettings/{fragments}/ShortcutsSection.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

describe("ShortcutsSection — General settings list every Daily shortcut", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  function setup() {
    mockBridgeIPC({"platform:is-mac": vi.fn().mockReturnValue(true)})
    wrapper = mount(ShortcutsSection)
  }

  function rows() {
    return wrapper.findAll("kbd").map((cap) => cap.element.parentElement.parentElement)
  }

  function row(label) {
    const found = rows().find((element) => element.firstElementChild.textContent.trim() === label)
    return Array.from(found.querySelectorAll("kbd")).map((cap) => cap.textContent.trim())
  }

  it("lays_the_blocks_out_in_two_columns_app_and_editor_left_formatting_and_comments_right", () => {
    setup()

    const columns = wrapper.findAll(".grid > div").map((column) => column.findAll("h3").map((heading) => heading.text()))

    expect(columns).toEqual([
      ["App", "Task editor"],
      ["Text formatting", "Comments"],
    ])
  })

  it("draws_each_chord_as_separate_caps_in_the_order_the_tooltips_use", () => {
    setup()

    expect(row("New Task")).toEqual(["⌘", "N"])
    expect(row("AI Assistant")).toEqual(["⌘", "⇧", "A"])
    expect(row("Settings")).toEqual(["⌘", ","])
    expect(row("Inline code")).toEqual(["⌘", "`"])
  })

  it("names_return_and_escape_by_their_symbols", () => {
    setup()

    expect(row("Save & Close")).toEqual(["⌘", "↵"])
    expect(row("Close")).toEqual(["Esc"])
    expect(row("Send")).toEqual(["⌘", "↵"])
    expect(row("Cancel")).toEqual(["Esc"])
  })
})
