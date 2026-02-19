import {inject, provide, ref} from "vue"

import type {Ref, Slots} from "vue"

const SLOTS_KEY = "contextMenuSlots"
const PREFERS_LEFT_KEY = "submenuPrefersLeft"
const REGISTER_KEY = "registerSubmenu"
const UNREGISTER_KEY = "unregisterSubmenu"

export function useContextMenuProvider(slots: Slots, submenuPrefersLeft: Ref<boolean>) {
  const submenuElements = ref<Set<HTMLElement>>(new Set())

  provide(SLOTS_KEY, slots)
  provide(PREFERS_LEFT_KEY, submenuPrefersLeft)
  provide(REGISTER_KEY, (el: HTMLElement) => {
    submenuElements.value.add(el)
  })
  provide(UNREGISTER_KEY, (el: HTMLElement) => {
    submenuElements.value.delete(el)
  })

  return {submenuElements}
}

export function useContextMenuConsumer() {
  const contextMenuSlots = inject<Record<string, any>>(SLOTS_KEY, {})
  const registerSubmenu = inject<(el: HTMLElement) => void>(REGISTER_KEY, () => {})
  const unregisterSubmenu = inject<(el: HTMLElement) => void>(UNREGISTER_KEY, () => {})

  return {contextMenuSlots, registerSubmenu, unregisterSubmenu}
}
