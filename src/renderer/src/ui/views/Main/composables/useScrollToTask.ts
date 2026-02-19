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

export function useScrollToTask(scrollContainerRef: Ref<HTMLElement | null>, options: ScrollToTaskOptions = {}) {
  const cacheElement = new Map<HTMLElement, string>()
  const scrollQueue = new Map<string, AbortController>()

  const {behavior = "smooth", block = "center", timeout = 2000} = options

  const rafId = shallowRef<number | null>(null)

  async function findElementOptimized(id: string, signal: AbortSignal): Promise<HTMLElement | null> {
    for (const [element, cachedId] of cacheElement.entries()) {
      if (cachedId === id && document.contains(element)) {
        return element
      }
    }

    const existing = document.getElementById(id)
    if (existing) {
      cacheElement.set(existing, id)
      return existing
    }

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

  async function queueScroll(taskId: string) {
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

      element.style.willChange = "scroll-position"

      element.scrollIntoView({behavior, block})

      setTimeout(() => {
        element.style.willChange = "auto"
        scrollQueue.delete(taskId)
      }, 500)
    } finally {
      scrollQueue.delete(taskId)
    }
  }

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
      if (taskId) scrollQueue.get(taskId)?.abort()
      else scrollQueue.forEach((c) => c.abort())
    },
    isScrolling: (taskId: string) => scrollQueue.has(taskId),
  }
}
