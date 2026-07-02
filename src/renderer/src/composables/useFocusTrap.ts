import {onBeforeUnmount, watchEffect} from "vue"

import {isBoolean} from "@shared/utils/common/validators"
import {findAllFocusableElements} from "@/utils/ui/dom"

import type {Ref} from "vue"

/**
 * Keep keyboard focus cycling within a container while enabled.
 *
 * Yields when a descendant already handled Tab itself (the keydown is
 * `defaultPrevented` by the time it bubbles up) — e.g. a CodeMirror editor that
 * uses Tab to indent. Without this the trap would relocate focus out of an editor
 * that happens to be the last focusable element in the container.
 *
 * @param containerRef - element to trap focus inside
 * @param enabled - whether the trap is active (boolean or reactive ref)
 */
export function useFocusTrap(containerRef: Ref<HTMLElement | null | undefined>, enabled: Ref<boolean> | boolean = true) {
  let cleanup: (() => void) | null = null

  const enabledRef = isBoolean(enabled) ? {value: enabled} : enabled

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !containerRef.value) return
    if (event.defaultPrevented) return

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
