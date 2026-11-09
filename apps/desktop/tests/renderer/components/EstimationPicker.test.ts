// @vitest-environment happy-dom
import {expect, it} from "vitest"

import EstimationPicker from "@/ui/common/(pickers)/EstimationPicker"
import {mount} from "@vue/test-utils"

it("updates the minute controls from logged seconds without editing the total", async () => {
  const wrapper = mount(EstimationPicker, {props: {modelValue: 50}, global: {directives: {tooltip: {}}}})

  try {
    await wrapper.setProps({modelValue: 61})

    const minutes = wrapper.findAll("input")[1]
    expect(minutes.element.value).toBe("1")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()

    await minutes.setValue("2")
    expect(wrapper.emitted("update:modelValue")).toEqual([[121]])

    await wrapper.setProps({modelValue: 121})
    await minutes.setValue("0")
    expect(wrapper.emitted("update:modelValue")).toEqual([[121], [0]])
  } finally {
    wrapper.unmount()
  }
})
