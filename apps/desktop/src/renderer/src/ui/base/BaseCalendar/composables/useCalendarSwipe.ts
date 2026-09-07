import {useEventListener} from "@vueuse/core"

import type {Ref} from "vue"

type UseCalendarSwipeOptions = {
  target: Ref<HTMLElement | null>
  onPreviousMonth: () => void
  onNextMonth: () => void
  wheelThreshold?: number
  gestureDebounceMs?: number
}

export function useCalendarSwipe({target, onPreviousMonth, onNextMonth, wheelThreshold = 120, gestureDebounceMs = 80}: UseCalendarSwipeOptions) {
  let gestureActive = false
  let fired = false
  let deltaAccum = 0
  let endTimer: ReturnType<typeof setTimeout> | null = null

  function normalizeWheelDelta(delta: number, deltaMode: number) {
    if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16
    if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * 120
    return delta
  }

  function getGestureDelta(event: WheelEvent) {
    const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode)
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode)

    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    const isHorizontalAxis = absX > absY && absX > 0

    return isHorizontalAxis ? deltaX : deltaY
  }

  function endGesture() {
    gestureActive = false
    fired = false
    deltaAccum = 0
    if (endTimer) clearTimeout(endTimer)
    endTimer = null
  }

  function scheduleGestureEnd() {
    if (endTimer) clearTimeout(endTimer)
    endTimer = setTimeout(endGesture, gestureDebounceMs)
  }

  function navigateBySign(delta: number) {
    if (delta > 0) onNextMonth()
    else onPreviousMonth()
  }

  function onWheel(event: WheelEvent) {
    if (event.ctrlKey) return

    const gestureDelta = getGestureDelta(event)
    if (!gestureDelta) return

    event.preventDefault()

    if (!gestureActive) {
      gestureActive = true
      fired = false
      deltaAccum = 0
    }

    if (fired) {
      scheduleGestureEnd()
      return
    }

    if (deltaAccum !== 0 && Math.sign(deltaAccum) !== Math.sign(gestureDelta)) {
      deltaAccum = 0
    }

    deltaAccum += gestureDelta

    if (Math.abs(deltaAccum) >= wheelThreshold) {
      fired = true
      navigateBySign(deltaAccum)
    }

    scheduleGestureEnd()
  }

  useEventListener(target, "wheel", onWheel, {passive: false})
}
