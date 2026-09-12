import {watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {DROP_DAY_SELECTOR, DROP_MILESTONE_SELECTOR, DROP_ZONE_SELECTOR, OVER_DROP_ZONE_CLASS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import type {ISODate, Milestone} from "@daily/protocol"

type PendingDrop = {type: "day"; taskId: string; date: ISODate} | {type: "milestone"; taskId: string; milestoneId: Milestone["id"]}

/**
 * Tracks the dragged task over day cells and milestone rows and asks the store to drop it.
 * Shared by every drop surface: the calendar's cells and the dock's milestone list. DOM
 * contract: droppable day cells inside `[data-popup]` or `[data-day-drop-zone]` must render
 * `data-drop-day="<ISODate>"`, and milestone rows must render `data-drop-milestone="<id>"`, so
 * this handler can resolve whichever target the pointer is over — the two are mutually
 * exclusive, since the dock's tabs only ever show one of them at a time. The dragged card is
 * hidden while over a `DROP_ZONE_SELECTOR` surface.
 */
export const useBoardDrop = createSharedComposable(() => {
  const dragDropStore = useDragDropStore()
  const {draggingTaskId, dropTargetDate, dropTargetMilestoneId} = storeToRefs(dragDropStore)

  let pendingDrop: PendingDrop | null = null

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, DROP_DAY_SELECTOR)
    const milestoneEl = findClosestAtPoint(clientX, clientY, DROP_MILESTONE_SELECTOR)
    const dragClone = findDragClone()

    const isOverDropZone = Boolean(findClosestAtPoint(clientX, clientY, DROP_ZONE_SELECTOR))

    if (isOverDropZone) dragClone?.classList.add(OVER_DROP_ZONE_CLASS)
    else dragClone?.classList.remove(OVER_DROP_ZONE_CLASS)

    if (dayEl) {
      const date = dayEl.dataset.dropDay as ISODate
      dragDropStore.setDropTargetDate(date)
      dragDropStore.setDropTargetMilestoneId(null)
      pendingDrop = {type: "day", taskId: draggingTaskId.value!, date}
    } else if (milestoneEl) {
      const milestoneId = milestoneEl.dataset.dropMilestone as Milestone["id"]
      dragDropStore.setDropTargetMilestoneId(milestoneId)
      dragDropStore.setDropTargetDate(null)
      pendingDrop = {type: "milestone", taskId: draggingTaskId.value!, milestoneId}
    } else {
      dragDropStore.setDropTargetDate(null)
      dragDropStore.setDropTargetMilestoneId(null)
      pendingDrop = null
    }
  }

  function onPointerUp(event: PointerEvent) {
    const releasedInsideDropZone = Boolean(findClosestAtPoint(event.clientX, event.clientY, DROP_ZONE_SELECTOR))
    if (releasedInsideDropZone) dragDropStore.setReleasedInsideDropZone(true)

    if (pendingDrop) {
      const drop = pendingDrop
      pendingDrop = null
      dragDropStore.setDropTargetDate(null)
      dragDropStore.setDropTargetMilestoneId(null)

      if (drop.type === "day") dragDropStore.dropOnDay(drop.taskId, drop.date)
      else dragDropStore.dropOnMilestone(drop.taskId, drop.milestoneId)
    }
    cleanup()
  }

  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp, true)
    dragDropStore.setDropTargetDate(null)
    dragDropStore.setDropTargetMilestoneId(null)
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

  return {dropTargetDate, dropTargetMilestoneId}
})
