import {toValue} from "vue"
import {tryOnScopeDispose, useEventListener} from "@vueuse/core"

import {findVerticalScrollAncestor} from "@/utils/ui/findVerticalScrollAncestor"

import type {MaybeRefOrGetter} from "vue"

type DragScrollOptions = {
  ignoreSelector?: string
  threshold?: number
}

const IGNORE_SELECTOR = "[data-task-card], button, a, input, textarea, select, [role='button'], [contenteditable='true']"
const MOVE_THRESHOLD = 4

/**
 * Grab-to-scroll for a horizontal scroll container (the board): press on empty
 * space and move to pan it, mouse-equivalent of touch dragging. The vertical
 * delta is forwarded to the scrollable column under the pointer. Drags that start
 * on a card or interactive control are ignored so the card reorder/click logic
 * keeps working.
 */
export function useDragScroll(target: MaybeRefOrGetter<HTMLElement | null>, options: DragScrollOptions = {}) {
  const ignoreSelector = options.ignoreSelector ?? IGNORE_SELECTOR
  const threshold = options.threshold ?? MOVE_THRESHOLD

  let active = false
  let engaged = false
  let startX = 0
  let startY = 0
  let startScrollLeft = 0
  let startScrollTop = 0
  let verticalContainer: HTMLElement | null = null

  function onPointerDown(event: PointerEvent) {
    const container = toValue(target)
    if (!container || event.button !== 0) return
    if (event.target instanceof HTMLElement && event.target.closest(ignoreSelector)) return

    active = true
    engaged = false
    startX = event.clientX
    startY = event.clientY
    startScrollLeft = container.scrollLeft
    verticalContainer = findVerticalScrollAncestor(event.target)
    startScrollTop = verticalContainer?.scrollTop ?? 0

    window.addEventListener("pointermove", onPointerMove, {passive: false})
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
  }

  function onPointerMove(event: PointerEvent) {
    const container = toValue(target)
    if (!active || !container) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (!engaged) {
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
      engage()
    }

    event.preventDefault()
    container.scrollLeft = startScrollLeft - dx
    if (verticalContainer) verticalContainer.scrollTop = startScrollTop - dy
  }

  function onPointerUp() {
    if (!active) return
    active = false
    if (engaged) disengage()
    verticalContainer = null
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerUp)
  }

  function engage() {
    engaged = true
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
  }

  function disengage() {
    engaged = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  useEventListener(target, "pointerdown", onPointerDown)
  tryOnScopeDispose(onPointerUp)
}
