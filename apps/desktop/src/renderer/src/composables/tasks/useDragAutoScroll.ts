import {onBeforeUnmount} from "vue"

import {clamp, isNull, notNull} from "@daily/std"

export function useDragAutoScroll(axis: "x" | "y") {
  let activeContainer: HTMLElement | null = null
  let velocity = 0
  let rafId: number | null = null

  function stop() {
    velocity = 0
    activeContainer = null
    if (isNull(rafId)) return
    window.cancelAnimationFrame(rafId)
    rafId = null
  }

  function update(container: HTMLElement | null, clientPosition: number) {
    const nextContainer = container ?? activeContainer
    if (!nextContainer) {
      stop()
      return
    }

    const edgeOffset = 72
    const maxSpeed = 16

    activeContainer = nextContainer
    const rect = nextContainer.getBoundingClientRect()
    const startDistance = clientPosition - (axis === "y" ? rect.top : rect.left)
    const endDistance = (axis === "y" ? rect.bottom : rect.right) - clientPosition

    let nextVelocity = 0

    if (startDistance < edgeOffset) {
      const intensity = 1 - clamp(startDistance / edgeOffset, 0, 1)
      nextVelocity = -Math.max(1, Math.round(intensity * maxSpeed))
    } else if (endDistance < edgeOffset) {
      const intensity = 1 - clamp(endDistance / edgeOffset, 0, 1)
      nextVelocity = Math.max(1, Math.round(intensity * maxSpeed))
    }

    velocity = nextVelocity

    if (velocity === 0) {
      if (notNull(rafId)) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      return
    }

    if (isNull(rafId)) {
      rafId = requestAnimationFrame(tick)
    }
  }

  function tick() {
    if (!activeContainer || velocity === 0) {
      rafId = null
      return
    }

    const {position, maxPosition} = readScroll(activeContainer)
    if (maxPosition <= 0) {
      stop()
      return
    }

    const nextPosition = clamp(position + velocity, 0, maxPosition)
    if (axis === "y") activeContainer.scrollTop = nextPosition
    else activeContainer.scrollLeft = nextPosition

    const reachedStart = nextPosition <= 0 && velocity < 0
    const reachedEnd = nextPosition >= maxPosition && velocity > 0

    if (reachedStart || reachedEnd) {
      stop()
      return
    }

    rafId = window.requestAnimationFrame(tick)
  }

  function readScroll(container: HTMLElement) {
    if (axis === "y") return {position: container.scrollTop, maxPosition: container.scrollHeight - container.clientHeight}
    return {position: container.scrollLeft, maxPosition: container.scrollWidth - container.clientWidth}
  }

  onBeforeUnmount(stop)

  return {
    update,
    stop,
  }
}
