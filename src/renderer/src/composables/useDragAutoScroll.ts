import {onBeforeUnmount} from "vue"

type DragAutoScrollOptions = {
  edgeOffset?: number
  maxSpeed?: number
}

const DEFAULT_EDGE_OFFSET = 72
const DEFAULT_MAX_SPEED = 16

export function useDragAutoScroll(options: DragAutoScrollOptions = {}) {
  const edgeOffset = options.edgeOffset ?? DEFAULT_EDGE_OFFSET
  const maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED

  let activeContainer: HTMLElement | null = null
  let velocity = 0
  let rafId: number | null = null

  function stop() {
    velocity = 0
    activeContainer = null
    if (rafId === null) return
    window.cancelAnimationFrame(rafId)
    rafId = null
  }

  function tick() {
    if (!activeContainer || velocity === 0) {
      rafId = null
      return
    }

    const maxScrollTop = activeContainer.scrollHeight - activeContainer.clientHeight
    if (maxScrollTop <= 0) {
      stop()
      return
    }

    const nextScrollTop = clamp(activeContainer.scrollTop + velocity, 0, maxScrollTop)
    activeContainer.scrollTop = nextScrollTop

    const reachedTop = nextScrollTop <= 0 && velocity < 0
    const reachedBottom = nextScrollTop >= maxScrollTop && velocity > 0

    if (reachedTop || reachedBottom) {
      stop()
      return
    }

    rafId = window.requestAnimationFrame(tick)
  }

  function update(container: HTMLElement | null, clientY: number) {
    const nextContainer = container ?? activeContainer
    if (!nextContainer) {
      stop()
      return
    }

    activeContainer = nextContainer
    const rect = nextContainer.getBoundingClientRect()
    const topDistance = clientY - rect.top
    const bottomDistance = rect.bottom - clientY

    let nextVelocity = 0

    if (topDistance < edgeOffset) {
      const intensity = 1 - clamp(topDistance / edgeOffset, 0, 1)
      nextVelocity = -Math.max(1, Math.round(intensity * maxSpeed))
    } else if (bottomDistance < edgeOffset) {
      const intensity = 1 - clamp(bottomDistance / edgeOffset, 0, 1)
      nextVelocity = Math.max(1, Math.round(intensity * maxSpeed))
    }

    velocity = nextVelocity

    if (velocity === 0) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      return
    }

    if (rafId === null) {
      rafId = requestAnimationFrame(tick)
    }
  }

  onBeforeUnmount(stop)

  return {
    update,
    stop,
  }
}

export function resolveVerticalScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null

  let current: HTMLElement | null = target
  while (current) {
    const style = window.getComputedStyle(current)
    const isScrollableY = /(auto|scroll|overlay)/.test(style.overflowY)
    if (isScrollableY && current.scrollHeight > current.clientHeight) {
      return current
    }
    current = current.parentElement
  }

  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
