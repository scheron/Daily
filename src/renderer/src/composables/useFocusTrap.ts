import {onBeforeUnmount, watchEffect} from "vue"
import {findAllFocusableElements} from "@/utils/dom"

import type {Ref} from "vue"

export function useFocusTrap(containerRef: Ref<HTMLElement | null | undefined>, enabled: Ref<boolean> | boolean = true) {
  let cleanup: (() => void) | null = null

  const enabledRef = typeof enabled === "boolean" ? {value: enabled} : enabled

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !containerRef.value) return

    const focusableElements = findAllFocusableElements(containerRef.value)

    if (!focusableElements.length) {
      event.preventDefault()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement as HTMLElement

    if (event.shiftKey) {
      if (activeElement === firstElement || !containerRef.value?.contains(activeElement)) {
        event.preventDefault()
        lastElement.focus()
      }
    } else {
      if (activeElement === lastElement || !containerRef.value?.contains(activeElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }
  }

  function setupTrap() {
    if (!containerRef.value || !enabledRef.value) {
      cleanupTrap()
      return
    }

    containerRef.value.addEventListener("keydown", handleKeyDown)

    cleanup = () => {
      if (containerRef.value) {
        containerRef.value.removeEventListener("keydown", handleKeyDown)
      }
    }
  }

  function cleanupTrap() {
    cleanup?.()
    cleanup = null
  }

  watchEffect(setupTrap)
  onBeforeUnmount(cleanupTrap)

  return {
    cleanupTrap,
  }
}
