import {ref} from "vue"
import {useEventListener} from "@vueuse/core"

import type {Ref} from "vue"

type UseCalendarSwipeOptions = {
  target: Ref<HTMLElement | null>
  onPreviousMonth: () => void
  onNextMonth: () => void
  wheelThreshold?: number
  touchThreshold?: number
  gestureDebounceMs?: number
  touchSwipeThrottleMs?: number
}

export function useCalendarSwipe({
  target,
  onPreviousMonth,
  onNextMonth,
  wheelThreshold = 16,
  touchThreshold = 28,
  gestureDebounceMs = 70,
  touchSwipeThrottleMs = 0,
}: UseCalendarSwipeOptions) {
  const wheelDeltaAccumulator = ref(0)
  const isWheelGestureConsumed = ref(false)
  let wheelGestureResetTimer: ReturnType<typeof setTimeout> | null = null

  const touchStartX = ref<number | null>(null)
  const touchStartY = ref<number | null>(null)
  const lastTouchSwipeAt = ref(0)

  function clearWheelResetTimer() {
    if (!wheelGestureResetTimer) return
    clearTimeout(wheelGestureResetTimer)
    wheelGestureResetTimer = null
  }

  function resetWheelGesture() {
    clearWheelResetTimer()
    wheelDeltaAccumulator.value = 0
    isWheelGestureConsumed.value = false
  }

  function scheduleWheelReset() {
    clearWheelResetTimer()
    wheelGestureResetTimer = setTimeout(resetWheelGesture, gestureDebounceMs)
  }

  function navigateByDelta(delta: number) {
    if (delta > 0) onNextMonth()
    else onPreviousMonth()
  }

  function normalizeWheelDelta(delta: number, deltaMode: number) {
    if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16
    if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * 120
    return delta
  }

  function handleWheel(event: WheelEvent) {
    if (event.ctrlKey) return

    const normalizedDeltaX = normalizeWheelDelta(event.deltaX, event.deltaMode)
    const normalizedDeltaY = normalizeWheelDelta(event.deltaY, event.deltaMode)
    const absX = Math.abs(normalizedDeltaX)
    const absY = Math.abs(normalizedDeltaY)
    const useHorizontalAxis = absX > absY && absX > 0
    const gestureDelta = useHorizontalAxis ? normalizedDeltaX : normalizedDeltaY
    if (gestureDelta === 0) return

    event.preventDefault()
    scheduleWheelReset()

    if (isWheelGestureConsumed.value) return

    const hasDirectionChanged = wheelDeltaAccumulator.value !== 0 && Math.sign(wheelDeltaAccumulator.value) !== Math.sign(gestureDelta)
    if (hasDirectionChanged) wheelDeltaAccumulator.value = 0

    wheelDeltaAccumulator.value += gestureDelta

    if (Math.abs(wheelDeltaAccumulator.value) < wheelThreshold) return

    navigateByDelta(wheelDeltaAccumulator.value)
    isWheelGestureConsumed.value = true
    wheelDeltaAccumulator.value = 0
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch) return

    touchStartX.value = touch.clientX
    touchStartY.value = touch.clientY
  }

  function handleTouchEnd(event: TouchEvent) {
    if (touchStartX.value === null || touchStartY.value === null) return

    const touch = event.changedTouches[0]
    if (!touch) {
      resetTouchSwipe()
      return
    }

    const deltaX = touchStartX.value - touch.clientX
    const deltaY = touchStartY.value - touch.clientY
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY)
    if (!isHorizontalSwipe) return
    if (Math.abs(deltaX) < touchThreshold) return

    const now = Date.now()
    const hasTouchThrottle = now - lastTouchSwipeAt.value < touchSwipeThrottleMs
    if (hasTouchThrottle) {
      resetTouchSwipe()
      return
    }

    navigateByDelta(deltaX)
    lastTouchSwipeAt.value = now
    resetTouchSwipe()
  }

  function resetTouchSwipe() {
    touchStartX.value = null
    touchStartY.value = null
  }

  useEventListener(target, "wheel", handleWheel, {passive: false})
  useEventListener(target, "touchstart", handleTouchStart, {passive: true})
  useEventListener(window, "touchend", handleTouchEnd, {passive: true})
  useEventListener(window, "touchcancel", resetTouchSwipe, {passive: true})
}
