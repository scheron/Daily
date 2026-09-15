import {ref} from "vue"
import {useEventListener} from "@vueuse/core"

export function useAxisDrag() {
  let startCoord = 0
  let activePointerId: number | null = null
  let handleEl: HTMLElement | null = null
  let onDelta: ((delta: number) => void) | null = null

  const isDragging = ref(false)

  useEventListener(window, "pointermove", onPointerMove)
  useEventListener(window, "pointerup", onPointerUp)
  useEventListener(window, "pointercancel", onPointerUp)

  function startDrag(event: PointerEvent, handleDelta: (delta: number) => void) {
    if (event.button !== 0) return
    handleEl = event.currentTarget as HTMLElement
    startCoord = event.clientX
    activePointerId = event.pointerId
    handleEl.setPointerCapture(event.pointerId)
    isDragging.value = true
    onDelta = handleDelta
    document.body.style.cursor = "ew-resize"
    document.body.style.userSelect = "none"
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging.value || event.pointerId !== activePointerId) return
    onDelta?.(event.clientX - startCoord)
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    if (handleEl?.hasPointerCapture(event.pointerId)) handleEl.releasePointerCapture(event.pointerId)
    activePointerId = null
    handleEl = null
    isDragging.value = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    onDelta = null
  }

  return {isDragging, startDrag}
}
