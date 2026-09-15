import {onBeforeUnmount, ref} from "vue"
import {useTimeoutFn} from "@vueuse/core"

import {hasSubmenu} from "./utils/hasSubmenu"

import type {BaseContextMenuItem} from "@/ui/base/BaseContextMenu/types"
import type {Ref} from "vue"

type Point = {x: number; y: number}

export function useSubmenuNavigation(submenuPanelRef: Ref<HTMLElement | null>) {
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  const hoveredItem = ref<BaseContextMenuItem | null>(null)
  const hoveredEl = ref<HTMLElement | null>(null)

  const activeSubmenuItem = ref<BaseContextMenuItem | null>(null)
  const activeSubmenuEl = ref<HTMLElement | null>(null)

  const prevMouse = ref<Point | null>(null)
  const currentMouse = ref<Point | null>(null)
  const pendingValue = ref<string | null>(null)

  const {start: startLeaveTimer, stop: stopLeaveTimer} = useTimeoutFn(
    () => {
      activeSubmenuItem.value = null
      activeSubmenuEl.value = null
      cancel()
    },
    150,
    {immediate: false},
  )

  function switchTo(item: BaseContextMenuItem | null, el: HTMLElement | null) {
    stopLeaveTimer()
    activeSubmenuItem.value = item
    activeSubmenuEl.value = el
  }

  function isMovingTowardSubmenu(current: Point, previous: Point, rect: DOMRect): boolean {
    const dx = current.x - previous.x
    const dy = current.y - previous.y

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false

    const submenuIsRight = rect.left >= previous.x

    if (submenuIsRight && dx <= 0) return false
    if (!submenuIsRight && dx >= 0) return false

    const nearX = submenuIsRight ? rect.left : rect.right
    const topCorner: Point = {x: nearX, y: rect.top - 4}
    const bottomCorner: Point = {x: nearX, y: rect.bottom + 4}

    return isPointInTriangle(current, previous, topCorner, bottomCorner)
  }

  function isPointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
    const d1 = sign(p, a, b)
    const d2 = sign(p, b, c)
    const d3 = sign(p, c, a)

    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0

    return !(hasNeg && hasPos)
  }

  function sign(p1: Point, p2: Point, p3: Point): number {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  }

  function clearTimers() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function requestSwitch(item: BaseContextMenuItem): boolean {
    const el = submenuPanelRef.value
    const curr = currentMouse.value
    const prev = prevMouse.value

    if (!el || !curr || !prev) {
      clearTimers()
      return true
    }

    const rect = el.getBoundingClientRect()
    if (!isMovingTowardSubmenu(curr, prev, rect)) {
      clearTimers()
      return true
    }

    const value = item.separator ? "" : item.value
    pendingValue.value = value
    clearTimers()

    fallbackTimer = setTimeout(() => {
      if (pendingValue.value === value) {
        if (!hasSubmenu(item)) {
          switchTo(null, null)
        } else if (hoveredItem.value && !hoveredItem.value.separator && hoveredItem.value.value === value) {
          switchTo(hoveredItem.value, hoveredEl.value)
        }
        pendingValue.value = null
      }
    }, 150)

    return false
  }

  function trackMouse(event: MouseEvent) {
    prevMouse.value = currentMouse.value
    currentMouse.value = {x: event.clientX, y: event.clientY}
  }

  function cancel() {
    clearTimers()
    pendingValue.value = null
  }

  function onItemHover(item: BaseContextMenuItem, el: HTMLElement) {
    stopLeaveTimer()

    hoveredItem.value = item
    hoveredEl.value = el

    if (!hasSubmenu(item)) {
      if (activeSubmenuItem.value) {
        const shouldDefer = !requestSwitch(item)
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
      const shouldDefer = !requestSwitch(item)
      if (shouldDefer) return
    }

    switchTo(item, el)
  }

  function onItemLeave() {
    startLeaveTimer()
  }

  function onSubmenuMouseenter() {
    stopLeaveTimer()
    cancel()
  }

  function onSubmenuMouseleave() {
    startLeaveTimer()
  }

  onBeforeUnmount(() => {
    stopLeaveTimer()
    cancel()
  })

  return {
    activeSubmenuItem,
    activeSubmenuEl,
    trackMouse,
    onItemHover,
    onItemLeave,
    onSubmenuMouseenter,
    onSubmenuMouseleave,
  }
}
