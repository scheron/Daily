import {onUnmounted, ref} from "vue"

import type {Ref} from "vue"

interface type {
  x: number
  y: number
}

/**
 * Solves the "diagonal submenu problem": when the mouse moves diagonally
 * from a parent item toward an open submenu, it passes through other items.
 * This composable delays switching to a new item if the mouse is heading
 * toward the submenu (safe triangle), preventing accidental submenu flicker.
 */
export function useSubmenuIntent(submenuEl: Ref<HTMLElement | null>) {
  const prevMouse = ref<type | null>(null)
  const currentMouse = ref<type | null>(null)
  const pendingValue = ref<string | null>(null)

  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  function isMovingTowardSubmenu(current: type, previous: type, rect: DOMRect): boolean {
    const dx = current.x - previous.x
    const dy = current.y - previous.y

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false

    const submenuIsRight = rect.left >= previous.x

    if (submenuIsRight && dx <= 0) return false
    if (!submenuIsRight && dx >= 0) return false

    const nearX = submenuIsRight ? rect.left : rect.right
    const topCorner: type = {x: nearX, y: rect.top - 4}
    const bottomCorner: type = {x: nearX, y: rect.bottom + 4}

    return isPointInTriangle(current, previous, topCorner, bottomCorner)
  }

  function isPointInTriangle(p: type, a: type, b: type, c: type): boolean {
    const d1 = sign(p, a, b)
    const d2 = sign(p, b, c)
    const d3 = sign(p, c, a)

    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0

    return !(hasNeg && hasPos)
  }

  function sign(p1: type, p2: type, p3: type): number {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  }

  function clearTimers() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function requestSwitch(value: string, onSwitch: (value: string) => void): boolean {
    const el = submenuEl.value
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

    pendingValue.value = value
    clearTimers()

    fallbackTimer = setTimeout(() => {
      if (pendingValue.value === value) {
        onSwitch(value)
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

  onUnmounted(clearTimers)

  return {
    trackMouse,
    requestSwitch,
    cancel,
  }
}
