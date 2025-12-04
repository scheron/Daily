import {nextTick, onUnmounted, shallowRef} from "vue"

import type {Ref} from "vue"

type ScrollToTaskOptions = {
  /** Scroll behavior @default "smooth" */
  behavior?: ScrollBehavior
  /** Block alignment @default "center" */
  block?: ScrollLogicalPosition
  /** Timeout for finding element (ms) @default 2000 */
  timeout?: number
}

/**
 * Advanced version with more features and better performance
 */
export function useScrollToTask(scrollContainerRef: Ref<HTMLElement | null>, options: ScrollToTaskOptions = {}) {
  const cacheElement = new Map<HTMLElement, string>()
  const scrollQueue = new Map<string, AbortController>()

  const {behavior = "smooth", block = "center", timeout = 2000} = options

  const rafId = shallowRef<number | null>(null)

  /**
   * Optimized element finder with caching
   */
  async function findElementOptimized(id: string, signal: AbortSignal): Promise<HTMLElement | null> {
    // Check cache first (for recently accessed elements)
    for (const [element, cachedId] of cacheElement.entries()) {
      if (cachedId === id && document.contains(element)) {
        return element
      }
    }

    // Direct lookup
    const existing = document.getElementById(id)
    if (existing) {
      cacheElement.set(existing, id)
      return existing
    }

    // Use RAF for smoother operation
    return new Promise((resolve) => {
      const startTime = performance.now()

      function checkElement() {
        if (signal.aborted) {
          resolve(null)
          return
        }

        const element = document.getElementById(id)
        if (element) {
          cacheElement.set(element, id)
          resolve(element)
          return
        }

        if (performance.now() - startTime < timeout) {
          rafId.value = requestAnimationFrame(checkElement)
        } else {
          resolve(null)
        }
      }

      rafId.value = requestAnimationFrame(checkElement)
    })
  }

  /**
   * Queue-based scrolling to prevent conflicts
   */
  async function queueScroll(taskId: string) {
    // Cancel previous scroll to same task
    const existingController = scrollQueue.get(taskId)
    if (existingController) {
      existingController.abort()
    }

    const controller = new AbortController()
    scrollQueue.set(taskId, controller)

    try {
      await nextTick()

      const element = await findElementOptimized(taskId, controller.signal)
      if (!element || controller.signal.aborted) return

      // Optimized scroll with will-change hint
      element.style.willChange = "scroll-position"

      element.scrollIntoView({behavior, block})

      // Cleanup will-change after animation
      setTimeout(() => {
        element.style.willChange = "auto"
        scrollQueue.delete(taskId)
      }, 500)
    } finally {
      scrollQueue.delete(taskId)
    }
  }

  // Cleanup
  function cleanup() {
    if (rafId.value) {
      cancelAnimationFrame(rafId.value)
      rafId.value = null
    }

    scrollQueue.forEach((controller) => controller.abort())
    scrollQueue.clear()
  }

  onUnmounted(cleanup)

  return {
    scrollToTask: queueScroll,
    cleanup,
    abort: (taskId?: string) => {
      if (taskId) {
        scrollQueue.get(taskId)?.abort()
      } else {
        scrollQueue.forEach((c) => c.abort())
      }
    },
    isScrolling: (taskId: string) => scrollQueue.has(taskId),
  }
}
