// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import BaseButton from "../../../src/renderer/src/ui/base/BaseButton"

describe("BaseButton", () => {
  it("prefers a custom icon slot and retains the icon prop as its fallback", () => {
    const custom = mount(BaseButton, {
      props: {icon: "plus"},
      slots: {icon: '<span aria-hidden="true">💼</span>'},
      global: {directives: {tooltip: {}}},
    })
    expect(custom.text()).toBe("💼")
    expect(custom.find('use[href="#plus"]').exists()).toBe(false)
    custom.unmount()

    const fallback = mount(BaseButton, {props: {icon: "plus"}, global: {directives: {tooltip: {}}}})
    expect(fallback.find('use[href="#plus"]').exists()).toBe(true)
    fallback.unmount()
  })

  it("replaces a custom icon and its label with a disabled loading indicator", async () => {
    const wrapper = mount(BaseButton, {
      slots: {icon: '<span aria-hidden="true">💼</span>', default: "Project"},
      global: {directives: {tooltip: {}}},
    })
    expect(wrapper.text()).toBe("💼Project")

    await wrapper.setProps({loading: true})

    expect(wrapper.text()).toBe("")
    expect(wrapper.find('use[href="#spinner"]').exists()).toBe(true)
    expect(wrapper.get("button").element.disabled).toBe(true)
    wrapper.unmount()
  })
})
