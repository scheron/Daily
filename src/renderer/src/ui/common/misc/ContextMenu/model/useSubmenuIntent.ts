import {onUnmounted, ref} from "vue"

import type {Ref} from "vue"

interface Point {
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
  const prevMouse = ref<Point | null>(null)
  const currentMouse = ref<Point | null>(null)
  const pendingValue = ref<string | null>(null)
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  function isMovingTowardSubmenu(current: Point, previous: Point, rect: DOMRect): boolean {
    const dx = current.x - previous.x
    const dy = current.y - previous.y

    // Need meaningful movement to determine direction
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false

    // Determine if submenu is to the right or left
    const submenuIsRight = rect.left >= previous.x

    // Check horizontal direction matches submenu side
    if (submenuIsRight && dx <= 0) return false
    if (!submenuIsRight && dx >= 0) return false

    // Build safe triangle: from previous mouse position to near corners of submenu
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

  /**
   * Called when the mouse hovers a new item.
   * Returns true if the switch should happen immediately,
   * false if it should be deferred (mouse heading toward submenu).
   */
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

    // Mouse is heading toward submenu — defer switch
    pendingValue.value = value
    clearTimers()

    fallbackTimer = setTimeout(() => {
      if (pendingValue.value === value) {
        onSwitch(value)
        pendingValue.value = null
      }
    }, 100)

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

  onUnmounted(() => {
    clearTimers()
  })

  return {
    trackMouse,
    requestSwitch,
    cancel,
  }
}
