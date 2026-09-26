import {onScopeDispose, ref} from "vue"

import {useFocusStore} from "@/stores/focus.store"
import {findRowGap} from "../utils/findRowGap"

import type {Task} from "@daily/protocol"
import type {ShallowRef} from "vue"

export function useRowReorder(listRef: Readonly<ShallowRef<HTMLElement | null>>) {
  const focusStore = useFocusStore()

  const draggedIndex = ref<number | null>(null)
  const reorderGap = ref<number | null>(null)

  let press: {taskId: Task["id"]; index: number; pointerId: number; x: number; y: number} | null = null

  function onRowPointerDown(event: PointerEvent, taskId: Task["id"], index: number) {
    if (press || event.button !== 0 || (event.target as Element | null)?.closest("button")) return

    press = {taskId, index, pointerId: event.pointerId, x: event.clientX, y: event.clientY}
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
    window.addEventListener("keydown", onKeyDown)
  }

  function onPointerMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return
    if (draggedIndex.value === null) {
      if (Math.abs(event.clientX - press.x) <= 2 && Math.abs(event.clientY - press.y) <= 2) return
      draggedIndex.value = press.index
    }

    event.preventDefault()
    const gap = findRowGap(listRef.value, event.clientY)
    reorderGap.value = toMoveIndex(gap, press.index) === press.index ? null : gap
  }

  function onPointerUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return

    const {taskId, index} = press
    const gap = reorderGap.value
    stop()
    if (gap !== null) focusStore.dispatch({type: "move", taskId, index: toMoveIndex(gap, index)})
  }

  function onPointerCancel(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) stop()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") stop()
  }

  function toMoveIndex(gap: number, index: number) {
    return gap > index ? gap - 1 : gap
  }

  function stop() {
    press = null
    draggedIndex.value = null
    reorderGap.value = null
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerCancel)
    window.removeEventListener("keydown", onKeyDown)
  }

  onScopeDispose(stop)

  return {draggedIndex, reorderGap, onRowPointerDown}
}
