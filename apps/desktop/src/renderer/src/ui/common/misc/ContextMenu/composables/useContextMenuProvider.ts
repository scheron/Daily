import {inject, provide, ref} from "vue"

import type {Ref, Slots} from "vue"

const KEY_SLOTS = Symbol("contextMenuSlots")
const KEY_PREFERS_LEFT = Symbol("submenuPrefersLeft")
const KEY_REGISTER = Symbol("registerSubmenu")
const KEY_UNREGISTER = Symbol("unregisterSubmenu")

export function useContextMenuProvider(slots: Slots, submenuPrefersLeft: Ref<boolean>) {
  const submenuElements = ref<Set<HTMLElement>>(new Set())

  provide(KEY_SLOTS, slots)
  provide(KEY_PREFERS_LEFT, submenuPrefersLeft)
  provide(KEY_REGISTER, (el: HTMLElement) => submenuElements.value.add(el))
  provide(KEY_UNREGISTER, (el: HTMLElement) => submenuElements.value.delete(el))

  return {submenuElements}
}

export function useContextMenuConsumer() {
  const contextMenuSlots = inject<Record<string, any>>(KEY_SLOTS, {})
  const registerSubmenu = inject<(el: HTMLElement) => void>(KEY_REGISTER, () => {})
  const unregisterSubmenu = inject<(el: HTMLElement) => void>(KEY_UNREGISTER, () => {})

  return {contextMenuSlots, registerSubmenu, unregisterSubmenu}
}
