import {computed, nextTick, ref, watch} from "vue"
import {useMutationObserver, useScroll} from "@vueuse/core"

import type {Ref} from "vue"

const BOTTOM_THRESHOLD = 120

/**
 * Keeps a scroll container pinned to the bottom while the user is at (or near)
 * the bottom, and stops auto-scrolling once they scroll up.
 *
 * @example
 * const {isAwayFromBottom, scrollToBottom} = useStickToBottom(containerRef)
 */
export function useStickToBottom(container: Ref<HTMLElement | null>) {
  const isStuck = ref(true)

  const isAwayFromBottom = computed(() => !isStuck.value)

  const {arrivedState} = useScroll(container, {offset: {bottom: BOTTOM_THRESHOLD}})

  useMutationObserver(
    container,
    () => {
      if (isStuck.value) nextTick(scrollToBottom)
    },
    {childList: true, subtree: true, characterData: true},
  )

  function scrollToBottom() {
    const el = container.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    isStuck.value = true
  }

  watch(
    () => arrivedState.bottom,
    (atBottom) => {
      isStuck.value = atBottom
    },
  )

  return {isStuck, isAwayFromBottom, scrollToBottom}
}
