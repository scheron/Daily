// @vitest-environment happy-dom
// @ts-nocheck
import {h} from "vue"
import {afterEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import ConfirmPopup from "../../../src/renderer/src/ui/overlays/ConfirmPopup.vue"

describe("ConfirmPopup", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function open(props = {}) {
    wrapper = mount(ConfirmPopup, {
      props: {title: "Delete task?", confirmText: "Delete", ...props},
      slots: {trigger: ({show}) => h("button", {type: "button", onClick: show}, "Open")},
    })

    await wrapper.find("button").trigger("click")
    await wrapper.vm.$nextTick()

    const popup = document.body.querySelector("[data-popup]")
    return Array.from(popup.querySelectorAll("button"))
  }

  it("emits_confirm_on_a_plain_click_of_the_confirm_button", async () => {
    const buttons = await open()
    const confirmButton = buttons.find((button) => button.textContent?.trim() === "Delete")

    confirmButton.dispatchEvent(new Event("click", {bubbles: true}))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted("confirm")).toHaveLength(1)
    expect(document.body.querySelector("[data-popup]")).toBeNull()
  })

  it("closes_without_confirming_when_cancel_is_clicked", async () => {
    const buttons = await open({cancelText: "Cancel"})
    const cancelButton = buttons.find((button) => button.textContent?.trim() === "Cancel")

    cancelButton.dispatchEvent(new Event("click", {bubbles: true}))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted("confirm")).toBeUndefined()
    expect(document.body.querySelector("[data-popup]")).toBeNull()
  })
})
