import {computed, onUnmounted, ref} from "vue"

export function useTyping() {
  const placeholder = "\u00A0"

  let rafId: number | null = null
  let lastTime = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const text = ref(placeholder)
  const isTyping = ref(false)
  const fullString = ref("")
  const index = ref(0)

  function animate(currentTime: number) {
    if (!isTyping.value) return

    if (!lastTime) lastTime = currentTime

    if (currentTime - lastTime >= 80) {
      index.value++
      text.value = fullString.value.slice(0, index.value)
      lastTime = currentTime

      if (index.value >= fullString.value.length) {
        isTyping.value = false
        timeoutId = setTimeout(() => {
          index.value = 0
          text.value = placeholder
          lastTime = 0
          isTyping.value = true
          rafId = requestAnimationFrame(animate)
        }, 1500)
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
    index.value = 0
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
    renderTyping,
    startTyping,
    stopTyping,
  }
}
