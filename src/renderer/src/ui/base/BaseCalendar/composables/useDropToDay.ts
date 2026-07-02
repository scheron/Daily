import {watch} from "vue"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {createSharedComposable} from "@/composables/createSharedComposable"
import {DROP_DAY_SELECTOR, DROP_ZONE_SELECTOR, OVER_DROP_ZONE_CLASS} from "@/constants/ui"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import type {ISODate} from "@shared/types/common"

/**
 * Tracks the dragged task over day cells and asks the store to drop it. Shared by every
 * day-cell surface. DOM contract: droppable day cells inside `.app-footer`, `[data-popup]`,
 * or `[data-day-drop-zone]` must render `data-drop-day="<ISODate>"` so this handler can
 * resolve the target date. The dragged card is hidden while over any of those surfaces.
 */
export const useDropToDay = createSharedComposable(() => {
  const dragDropStore = useDragDropStore()
  const {draggingTaskId, dropTargetDate} = storeToRefs(dragDropStore)

  let pendingDrop: {taskId: string; date: ISODate} | null = null

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, DROP_DAY_SELECTOR)
    const dragClone = findDragClone()

    const isOverDropZone = Boolean(findClosestAtPoint(clientX, clientY, DROP_ZONE_SELECTOR))

    if (isOverDropZone) dragClone?.classList.add(OVER_DROP_ZONE_CLASS)
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
