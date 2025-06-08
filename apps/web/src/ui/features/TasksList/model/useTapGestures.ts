import {useDebounceFn, useEventListener} from "@vueuse/core"

import type {MaybeRefOrGetter} from "@vueuse/core"

export type TapGesturesOptions = {
  delay?: number
  maxWait?: number
}

export function useTapGestures(target: MaybeRefOrGetter<EventTarget | null | undefined>, onTrigger: () => void, options: TapGesturesOptions = {}) {
  const {delay = 300, maxWait = 300} = options

  let lastTap = 0
  let isWaiting = false

  const debouncedTrigger = useDebounceFn(() => {
    isWaiting = false
    lastTap = 0
  }, maxWait)

  function onTap(e: TouchEvent) {
    const now = Date.now()

    if (now - lastTap < delay) {
      e.preventDefault()
      isWaiting = false
      lastTap = 0

      onTrigger()
      return
    }

    if (!isWaiting) {
      isWaiting = true
      lastTap = now

      debouncedTrigger()
    }
  }

  useEventListener(target, "touchstart", onTap, {passive: false})

  return {}
}
