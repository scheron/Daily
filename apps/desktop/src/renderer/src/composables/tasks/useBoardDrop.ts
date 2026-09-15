import {watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {findClosestAtPoint} from "@/utils/ui/dom"

import type {ISODate, Milestone} from "@daily/protocol"

type PendingDrop = {type: "day"; taskId: string; date: ISODate} | {type: "milestone"; taskId: string; milestoneId: Milestone["id"]}

const DROP_ZONE_SELECTOR = "[data-popup], [data-day-drop-zone]"
const OVER_DROP_ZONE_CLASS = "is-over-drop-zone"

export const useBoardDrop = createSharedComposable(() => {
  const dragDropStore = useDragDropStore()
  const {draggingTaskId, dropTargetDate} = storeToRefs(dragDropStore)

  let pendingDrop: PendingDrop | null = null

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, "[data-drop-day]")
    const milestoneEl = findClosestAtPoint(clientX, clientY, "[data-drop-milestone]")
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
    const isReleasedInsideDropZone = Boolean(findClosestAtPoint(event.clientX, event.clientY, DROP_ZONE_SELECTOR))
    if (isReleasedInsideDropZone) dragDropStore.setReleasedInsideDropZone(true)

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

  return {dropTargetDate}
})

function findDragClone(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".draggable-task-dragging")
}
