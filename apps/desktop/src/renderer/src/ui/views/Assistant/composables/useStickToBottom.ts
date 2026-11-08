import {computed, nextTick, ref, toRefs, toValue, watch} from "vue"
import {useMutationObserver, useScroll} from "@vueuse/core"

import type {MaybeRefOrGetter} from "vue"

export function useStickToBottom(container: MaybeRefOrGetter<HTMLElement | null>) {
  const isStuck = ref(true)

  const isAwayFromBottom = computed(() => !isStuck.value)

  const {arrivedState} = useScroll(container, {offset: {bottom: 120}})
  const {bottom: isAtBottom} = toRefs(arrivedState)

  useMutationObserver(
    container,
    () => {
      if (isStuck.value) nextTick(scrollToBottom)
    },
    {childList: true, subtree: true, characterData: true},
  )

  function scrollToBottom() {
    const el = toValue(container)
    if (!el) return
    el.scrollTop = el.scrollHeight
    isStuck.value = true
  }

  watch(isAtBottom, (atBottom) => {
    isStuck.value = atBottom
  })

  return {isAwayFromBottom, scrollToBottom}
}
