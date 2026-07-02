import {ref} from "vue"
import {useEventListener} from "@vueuse/core"

type DragDirection = "horizontal" | "vertical"

/**
 * Axis-aware pointer-drag primitive for resize handles. Owns the pointer lifecycle
 * (capture, body cursor, cleanup) and reports the drag delta in px along the variant's axis.
 * @param variant - "horizontal" tracks clientX (ew-resize), "vertical" tracks clientY (ns-resize)
 * @example const {isDragging, startDrag} = useAxisDrag("horizontal")
 */
export function useAxisDrag(variant: DragDirection) {
  const isDragging = ref(false)

  let startCoord = 0
  let activePointerId: number | null = null
  let handleEl: HTMLElement | null = null
  let onDelta: ((delta: number) => void) | null = null
  let onEnd: (() => void) | null = null

  /**
   * Begin a drag from a `pointerdown` on a handle element.
   * @param event - The originating pointer event (its `currentTarget` is captured)
   * @param handleDelta - Called on each move with the px delta along the variant's axis
   * @param handleEnd - Called once when the drag finishes
   */
  function startDrag(event: PointerEvent, handleDelta: (delta: number) => void, handleEnd?: () => void) {
    if (event.button !== 0) return
    handleEl = event.currentTarget as HTMLElement
    startCoord = variant === "horizontal" ? event.clientX : event.clientY
    activePointerId = event.pointerId
    handleEl.setPointerCapture(event.pointerId)
    isDragging.value = true
    onDelta = handleDelta
    onEnd = handleEnd ?? null
    document.body.style.cursor = variant === "horizontal" ? "ew-resize" : "ns-resize"
    document.body.style.userSelect = "none"
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging.value || event.pointerId !== activePointerId) return
    const coord = variant === "horizontal" ? event.clientX : event.clientY
    onDelta?.(coord - startCoord)
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    if (handleEl?.hasPointerCapture(event.pointerId)) handleEl.releasePointerCapture(event.pointerId)
    activePointerId = null
    handleEl = null
    isDragging.value = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    onEnd?.()
    onDelta = null
    onEnd = null
  }

  useEventListener(window, "pointermove", onPointerMove)
  useEventListener(window, "pointerup", onPointerUp)
  useEventListener(window, "pointercancel", onPointerUp)

  return {isDragging, startDrag}
}
