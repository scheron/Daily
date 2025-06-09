import {computed, ref} from "vue"
import {useDebounceFn} from "@vueuse/core"

import type {Ref} from "vue"

export type SwipeDirection = "right" | "left" | null

export type SwipeStateOptions = {
  maxSwipe: Ref<number>
  actionThreshold: Ref<number>
  onTrigger?: (direction: SwipeDirection) => void
}

export function useSwipeState(options: SwipeStateOptions) {
  const {maxSwipe, actionThreshold, onTrigger} = options

  const offset = ref(0)
  const isActive = ref(false)

  const leftOpacity = computed(() => (offset.value <= 0 ? 0 : Math.min(offset.value / actionThreshold.value, 1)))
  const rightOpacity = computed(() => (offset.value >= 0 ? 0 : Math.min(Math.abs(offset.value) / actionThreshold.value, 1)))
  const shouldLeftActionTrigger = computed(() => offset.value >= actionThreshold.value)
  const shouldRightActionTrigger = computed(() => offset.value <= -actionThreshold.value)

  function trigger(direction: SwipeDirection) {
    return useDebounceFn(() => {
      resetSwipe()
      onTrigger?.(direction)
    }, 100)
  }

  function resetSwipe() {
    offset.value = 0
    isActive.value = false
  }

  function updatePosition(deltaX: number) {
    offset.value = Math.max(Math.min(deltaX, maxSwipe.value), -maxSwipe.value)
  }

  function setActive(active: boolean) {
    isActive.value = active
  }

  function triggerSwipe() {
    if (!isActive.value) {
      offset.value = 0
      return
    }

    if (offset.value > actionThreshold.value) trigger("right")()
    else if (offset.value < -actionThreshold.value) trigger("left")()
    else trigger(null)()
  }

  return {
    offset,
    isActive,

    leftOpacity,
    rightOpacity,
    shouldLeftActionTrigger,
    shouldRightActionTrigger,

    updatePosition,
    setActive,
    resetSwipe,
    triggerSwipe,
  }
}
