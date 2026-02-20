import {ref} from "vue"
import {useTimeoutFn} from "@vueuse/core"

import {useSubmenuIntent} from "./useSubmenuIntent"

import type {Ref} from "vue"
import type {ContextMenuItem} from "../types"

export function useSubmenuNavigation(submenuPanelRef: Ref<HTMLElement | null>) {
  const hoveredItem = ref<ContextMenuItem | null>(null)
  const hoveredEl = ref<HTMLElement | null>(null)

  const activeSubmenuItem = ref<ContextMenuItem | null>(null)
  const activeSubmenuEl = ref<HTMLElement | null>(null)

  function hasSubmenu(item: ContextMenuItem): boolean {
    if (item.separator) return false
    return !!item.children
  }

  const {trackMouse, requestSwitch, cancel: cancelIntent} = useSubmenuIntent(submenuPanelRef)

  const {start: startLeaveTimer, stop: stopLeaveTimer} = useTimeoutFn(
    () => {
      activeSubmenuItem.value = null
      activeSubmenuEl.value = null
      cancelIntent()
    },
    150,
    {immediate: false},
  )

  function switchTo(item: ContextMenuItem | null, el: HTMLElement | null) {
    stopLeaveTimer()
    activeSubmenuItem.value = item
    activeSubmenuEl.value = el
  }

  function onItemHover(item: ContextMenuItem, el: HTMLElement) {
    stopLeaveTimer()

    hoveredItem.value = item
    hoveredEl.value = el

    if (!hasSubmenu(item)) {
      if (activeSubmenuItem.value) {
        const shouldDefer = !requestSwitch(item.separator ? "" : item.value, () => switchTo(null, null))
        if (shouldDefer) return
      }

      switchTo(null, null)
      return
    }

    const isSubmenuOpen = activeSubmenuItem.value && !activeSubmenuItem.value.separator && activeSubmenuItem.value.value === item.value

    if (isSubmenuOpen) {
      stopLeaveTimer()
      return
    }

    if (activeSubmenuItem.value) {
      const shouldDefer = !requestSwitch(item.separator ? "" : item.value, (value) => {
        if (hoveredItem.value && !hoveredItem.value.separator && hoveredItem.value.value === value) {
          switchTo(hoveredItem.value, hoveredEl.value)
        }
      })
      if (shouldDefer) return
    }

    switchTo(item, el)
  }

  function onItemLeave() {
    startLeaveTimer()
  }

  function onSubmenuMouseenter() {
    stopLeaveTimer()
    cancelIntent()
  }

  function onSubmenuMouseleave() {
    startLeaveTimer()
  }

  function cleanup() {
    stopLeaveTimer()
    cancelIntent()
  }

  return {
    activeSubmenuItem,
    activeSubmenuEl,
    trackMouse,
    onItemHover,
    onItemLeave,
    onSubmenuMouseenter,
    onSubmenuMouseleave,
    cleanup,
  }
}
