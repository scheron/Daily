// @ts-nocheck
import {defineComponent, h, ref} from "vue"

import {mount} from "@vue/test-utils"

/** Mounts `component` the way `BasePopup` holds it: its `close` event unmounts it. */
export function mountInPopup(component, props = {}) {
  const isOpen = ref(true)

  const wrapper = mount(
    defineComponent({
      setup() {
        return () => (isOpen.value ? h(component, {...props, onClose: () => (isOpen.value = false)}) : h("div"))
      },
    }),
  )

  return {wrapper, isOpen}
}
