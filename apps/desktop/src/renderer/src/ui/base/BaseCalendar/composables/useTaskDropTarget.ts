import {watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {DROP_DAY_SELECTOR, DROP_HIDE_SELECTOR, OVER_DROP_ZONE_CLASS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import type {ISODate} from "@daily/protocol"

type PendingDrop = {taskId: string; date: ISODate}

/**
 * Tracks the dragged task over day cells and asks the store to drop it on
 * whichever it's released over. Shared by every day-cell surface. DOM
 * contract: droppable day cells inside `.app-footer`, `[data-popup]`, or
 * `[data-day-drop-zone]` must render `data-drop-day="<ISODate>"`. The dragged
 * card is hidden while over a whole calendar container, so the day highlight
 * underneath stays visible and the card does not flicker in the gaps between
 * cells; over the sidebar's task column it stays in hand.
 */
export const useTaskDropTarget = createSharedComposable(() => {
  const dragDropStore = useDragDropStore()
  const {draggingTaskId, dropTargetDate} = storeToRefs(dragDropStore)

  let pendingDrop: PendingDrop | null = null

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, DROP_DAY_SELECTOR)
    const dragClone = findDragClone()

    const isOverHideSurface = Boolean(findClosestAtPoint(clientX, clientY, DROP_HIDE_SELECTOR))

    if (isOverHideSurface) dragClone?.classList.add(OVER_DROP_ZONE_CLASS)
    else dragClone?.classList.remove(OVER_DROP_ZONE_CLASS)

    if (dayEl) {
      const date = dayEl.dataset.dropDay as ISODate
      dragDropStore.setDropTargetDate(date)
      pendingDrop = {taskId: draggingTaskId.value!, date}
    } else {
      dragDropStore.setDropTargetDate(null)
      pendingDrop = null
    }
  }

  function onPointerUp() {
    if (pendingDrop) {
      const {taskId, date} = pendingDrop
      pendingDrop = null
      dragDropStore.setDropTargetDate(null)

      dragDropStore.dropOnDay(taskId, date)
    }
    cleanup()
  }

  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp, true)
    dragDropStore.setDropTargetDate(null)
    pendingDrop = null
    findDragClone()?.classList.remove(OVER_DROP_ZONE_CLASS)
  }

  watch(draggingTaskId, (id) => {
    if (id) {
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp, true)
    } else {
      cleanup()
    }
  })

  return {dropTargetDate}
})
