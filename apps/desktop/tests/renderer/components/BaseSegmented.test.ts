// @vitest-environment happy-dom
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"

const options = [
  {value: "a", label: "A"},
  {value: "b", label: "B"},
  {value: "c", label: "C"},
]

async function mountSegmented(modelValue = "a", opts = options) {
  const {default: BaseSegmented} = await import("../../../src/renderer/src/ui/base/BaseSegmented.vue")
  return mount(BaseSegmented, {
    props: {options: opts, modelValue, "onUpdate:modelValue": (value) => wrapper.setProps({modelValue: value}), "aria-label": "Pick one"},
    attachTo: document.body,
    global: {directives: {tooltip: {mounted: (el, binding) => binding.value && el.setAttribute("data-tooltip", binding.value)}}},
  })
}

let wrapper = null

describe("BaseSegmented", () => {
  it("is a named radio group with the chosen option checked and the only tab stop", async () => {
    wrapper = await mountSegmented("b")

    expect(wrapper.attributes("role")).toBe("radiogroup")
    expect(wrapper.attributes("aria-label")).toBe("Pick one")
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((radio) => radio.attributes("aria-checked"))).toEqual(["false", "true", "false"])
    expect(radios.map((radio) => radio.attributes("tabindex"))).toEqual(["-1", "0", "-1"])
    wrapper.unmount()
  })

  it("moves and selects with the arrow keys, wrapping at the ends", async () => {
    wrapper = await mountSegmented("a")
    const radios = () => wrapper.findAll('[role="radio"]')

    await radios()[0].trigger("keydown", {key: "ArrowRight"})
    expect(wrapper.props("modelValue")).toBe("b")
    expect(document.activeElement).toBe(radios()[1].element)

    await radios()[1].trigger("keydown", {key: "ArrowLeft"})
    await radios()[0].trigger("keydown", {key: "ArrowLeft"})
    expect(wrapper.props("modelValue")).toBe("c")
    expect(document.activeElement).toBe(radios()[2].element)
    wrapper.unmount()
  })

  it("moves_and_selects_with_ArrowDown_and_ArrowUp_like_the_horizontal_arrows", async () => {
    wrapper = await mountSegmented("a")
    const radios = () => wrapper.findAll('[role="radio"]')

    await radios()[0].trigger("keydown", {key: "ArrowDown"})
    expect(wrapper.props("modelValue")).toBe("b")
    expect(document.activeElement).toBe(radios()[1].element)

    await radios()[1].trigger("keydown", {key: "ArrowUp"})
    await radios()[0].trigger("keydown", {key: "ArrowUp"})
    expect(wrapper.props("modelValue")).toBe("c")
    expect(document.activeElement).toBe(radios()[2].element)
    wrapper.unmount()
  })

  it("selects_the_option_the_arrows_focused_when_Space_or_Enter_activates_it", async () => {
    wrapper = await mountSegmented("a")
    const radios = () => wrapper.findAll('[role="radio"]')

    await radios()[0].trigger("keydown", {key: "ArrowRight"})
    await radios()[1].trigger("keydown", {key: "ArrowRight"})
    await wrapper.setProps({modelValue: "a"})
    ;(document.activeElement as HTMLElement).click()
    await wrapper.vm.$nextTick()

    expect(wrapper.props("modelValue")).toBe("c")
    wrapper.unmount()
  })

  it("gives_the_first_option_the_tab_stop_when_the_value_matches_none", async () => {
    wrapper = await mountSegmented("zzz")

    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.attributes("tabindex"))).toEqual(["0", "-1", "-1"])
    wrapper.unmount()
  })

  it("draws_an_icon_option_without_text_named_and_tooltipped_by_its_label_in_its_own_colours", async () => {
    const iconOptions = [
      {value: "a", label: "A", icon: "fire", activeClass: "text-accent"},
      {value: "b", label: "B", icon: "check-check", activeClass: "text-success"},
    ]
    wrapper = await mountSegmented("b", iconOptions)
    const [first, second] = wrapper.findAll('[role="radio"]')

    expect(first.find('use[href="#fire"]').exists()).toBe(true)
    expect(first.text()).toBe("")
    expect(first.attributes("aria-label")).toBe("A")
    expect(first.attributes("data-tooltip")).toBe("A")
    expect(second.classes()).toContain("text-success")
    expect(first.classes()).not.toContain("text-accent")
    expect(first.classes()).toContain("text-base-content/60")
    wrapper.unmount()
  })
})
