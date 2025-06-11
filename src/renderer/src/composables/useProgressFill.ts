import {computed, onUnmounted, ref, toValue, watch} from "vue"
import {onLongPress, useEventListener} from "@vueuse/core"

import type {MaybeRef, Ref} from "vue"

interface UseProgressFillOptions {
  duration?: number
  color?: MaybeRef<string>
  onComplete?: () => void
}

export function useProgressFill(elementRef: Ref<HTMLElement | null>, options: UseProgressFillOptions = {}) {
  const duration = options.duration ?? 1000
  const color = computed(() => toValue(options.color) ?? "#000000")

  const progress = ref(0)
  const isComplete = ref(false)
  const startTime = ref(0)
  const animationFrame = ref<number>()

  const progressElement = document.createElement("div")
  progressElement.className = "absolute inset-0"
  progressElement.dataset.progress = ""
  progressElement.style.width = "var(--progress, 0%)"

  function setupProgressElement(element: HTMLElement) {
    const existingProgress = element.querySelector("[data-progress]")
    if (existingProgress) existingProgress.remove()

    element.style.position = "relative"
    element.style.overflow = "hidden"

    element.prepend(progressElement)
  }

  function cleanupProgressElement(element: HTMLElement) {
    const progress = element.querySelector("[data-progress]")
    if (progress) progress.remove()
  }

  function startProgress() {
    if (!elementRef.value) return

    progressElement.style.backgroundColor = toValue(color)

    startTime.value = performance.now()
    progress.value = 0
    isComplete.value = false
    updateProgress()
  }

  function updateProgress() {
    if (!elementRef.value) return

    const currentTime = performance.now()
    const elapsed = currentTime - startTime.value
    progress.value = Math.min(elapsed / duration, 1)

    elementRef.value.style.setProperty("--progress", `${progress.value * 100}%`)

    if (progress.value < 1) {
      animationFrame.value = requestAnimationFrame(updateProgress)
    } else {
      isComplete.value = true
      options.onComplete?.()
    }
  }

  function stopProgress() {
    if (animationFrame.value) cancelAnimationFrame(animationFrame.value)

    progress.value = 0
    isComplete.value = false

    if (elementRef.value) elementRef.value.style.setProperty("--progress", "0%")
  }

  watch(
    elementRef,
    (element) => {
      if (!element) return
      setupProgressElement(element)
    },
    {immediate: true},
  )

  onLongPress(elementRef, startProgress, {
    delay: 0,
    modifiers: {stop: true},
  })

  useEventListener(elementRef, "mouseup", stopProgress)
  useEventListener(elementRef, "mouseleave", stopProgress)
  useEventListener(elementRef, "touchend", stopProgress)

  onUnmounted(() => {
    if (animationFrame.value) cancelAnimationFrame(animationFrame.value)
    if (elementRef.value) cleanupProgressElement(elementRef.value)
  })

  return {
    progress,
    isComplete,
    startProgress,
    stopProgress,
  }
}
