import {toValue, watchEffect} from "vue"

import {findAllFocusableElements} from "@/utils/ui/dom"

import type {MaybeRefOrGetter} from "vue"

export function watchFocusTrap(containerRef: MaybeRefOrGetter<HTMLElement | null | undefined>, enabled: MaybeRefOrGetter<boolean>) {
  watchEffect((onCleanup) => {
    const container = toValue(containerRef)
    if (!container || !toValue(enabled)) return

    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(container, event)
    container.addEventListener("keydown", onKeyDown)
    onCleanup(() => container.removeEventListener("keydown", onKeyDown))
  })

  function handleKeyDown(container: HTMLElement, event: KeyboardEvent) {
    if (event.key !== "Tab" || event.defaultPrevented) return

    const focusableElements = findAllFocusableElements(container)

    if (!focusableElements.length) {
      event.preventDefault()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement as HTMLElement

    if (event.shiftKey) {
      if (activeElement === firstElement || !container.contains(activeElement)) {
        event.preventDefault()
        lastElement.focus()
      }
    } else {
      if (activeElement === lastElement || !container.contains(activeElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }
  }
}
