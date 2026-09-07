import {computed, onUnmounted, ref} from "vue"

import type {Ref} from "vue"

export type UseTypingOptions = {
  /** Interval between characters (ms) @default 100 */
  duration?: number
  /** Loop the typing @default true */
  loop?: boolean
  /** Start from the character index @default 0 */
  startFrom?: number
  /** Delay before repeating the loop (ms) @default 1200 */
  endDelay?: number
  /** Space character @default "&nbsp;" */
  placeholder?: string
}

export function useTyping(baseOptions: UseTypingOptions = {}) {
  const {duration = 100, loop = true, startFrom = 0, endDelay = 1200, placeholder = "\u00A0"} = baseOptions

  let rafId: number | null = null
  let lastTime = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const text: Ref<string> = ref(placeholder)
  const isTyping = ref(false)
  const fullString = ref("")
  const index = ref(0)

  function animate(currentTime: number) {
    if (!isTyping.value) return

    if (!lastTime) lastTime = currentTime

    if (currentTime - lastTime >= duration) {
      index.value++
      text.value = fullString.value.slice(0, index.value)
      lastTime = currentTime

      if (index.value >= fullString.value.length) {
        if (loop) {
          isTyping.value = false
          timeoutId = setTimeout(() => {
            index.value = 0
            text.value = placeholder
            lastTime = 0
            isTyping.value = true
            rafId = requestAnimationFrame(animate)
          }, endDelay)
        } else {
          stopTyping()
        }
        return
      }
    }

    rafId = requestAnimationFrame(animate)
  }

  function stopTyping() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    isTyping.value = false
    lastTime = 0
  }

  function startTyping(str: string) {
    stopTyping()

    if (!str) {
      text.value = placeholder
      return
    }

    fullString.value = str
    index.value = Math.max(0, Math.min(startFrom, str.length))
    text.value = str.slice(0, index.value)

    isTyping.value = true
    lastTime = 0
    rafId = requestAnimationFrame(animate)
  }

  function renderTyping(str: string) {
    if (str !== fullString.value) {
      startTyping(str)
    }
    return computed(() => text.value)
  }

  onUnmounted(() => stopTyping())

  return {
    text,
    isTyping,
    renderTyping,
    startTyping,
    stopTyping,
  }
}
