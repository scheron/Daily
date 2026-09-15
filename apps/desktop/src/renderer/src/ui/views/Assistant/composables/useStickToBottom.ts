import {computed, nextTick, ref, toRefs, watch} from "vue"
import {useMutationObserver, useScroll} from "@vueuse/core"

import type {Ref} from "vue"

export function useStickToBottom(container: Ref<HTMLElement | null>) {
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
    const el = container.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    isStuck.value = true
  }

  watch(isAtBottom, (atBottom) => {
    isStuck.value = atBottom
  })

  return {isAwayFromBottom, scrollToBottom}
}
