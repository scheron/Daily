import {computed, onUnmounted, ref, watch} from "vue"
import {onLongPress, useEventListener} from "@vueuse/core"

import type {Ref} from "vue"

export function useProgressFill(elementRef: Ref<HTMLElement | null>, onComplete: () => void) {
  const progress = ref(0)
  const isComplete = ref(false)
  const startTime = ref(0)
  const animationFrame = ref<number>()
  const progressElement = createProgressElement()

  const isFilling = computed(() => !isComplete.value && progress.value > 0)

  onLongPress(elementRef, startProgress, {
    delay: 0,
    modifiers: {stop: true},
  })

  useEventListener(elementRef, "mouseup", stopProgress)
  useEventListener(elementRef, "mouseleave", stopProgress)
  useEventListener(elementRef, "touchend", stopProgress)

  function createProgressElement() {
    const element = document.createElement("div")
    element.className = "absolute inset-0"
    element.dataset.progress = ""
    element.style.width = "var(--progress, 0%)"
    element.style.backgroundColor = "color-mix(in oklch, var(--color-error), transparent 62%)"
    return element
  }

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

    startTime.value = performance.now()
    progress.value = 0
    isComplete.value = false
    updateProgress()
  }

  function updateProgress() {
    if (!elementRef.value) return

    const currentTime = performance.now()
    const elapsed = currentTime - startTime.value
    progress.value = Math.min(elapsed / 500, 1)

    elementRef.value.style.setProperty("--progress", `${progress.value * 100}%`)

    if (progress.value < 1) {
      animationFrame.value = requestAnimationFrame(updateProgress)
    } else {
      isComplete.value = true
      onComplete()
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

  onUnmounted(() => {
    if (animationFrame.value) cancelAnimationFrame(animationFrame.value)
    if (elementRef.value) cleanupProgressElement(elementRef.value)
  })

  return {isFilling}
}
