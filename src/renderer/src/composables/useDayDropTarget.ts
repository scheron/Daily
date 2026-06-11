import {onScopeDispose, ref, watch} from "vue"

import {useTasksStore} from "@/stores/tasks.store"
import {draggingTaskId} from "@/composables/useTaskDragDrop"
import {findClosestAtPoint, findDragClone} from "@/utils/ui/dom"

import type {ISODate} from "@shared/types/common"

/**
 * Shared by every day-cell surface (footer week strip, calendar sidebar, popups).
 * DOM contract: droppable day cells inside `.app-footer`, `.app-sidebar`, or
 * `[data-popup]` must render `data-drop-day="<ISODate>"` so this handler can resolve the target date.
 */
export const dropTargetDate = ref<ISODate | null>(null)

/** Activate the global pointer tracking. Call once from Main.vue. */
export function useDayDropTarget() {
  const tasksStore = useTasksStore()
  const pendingDrop = ref<{taskId: string; date: ISODate} | null>(null)

  function onPointerMove(event: PointerEvent) {
    const {clientX, clientY} = event
    const dayEl = findClosestAtPoint(clientX, clientY, "[data-drop-day]")
    const dragClone = findDragClone()

    const isOverDropZone = Boolean(
      findClosestAtPoint(clientX, clientY, ".app-footer") ||
      findClosestAtPoint(clientX, clientY, ".app-sidebar") ||
      findClosestAtPoint(clientX, clientY, "[data-popup]"),
    )

    if (isOverDropZone) {
      dragClone?.classList.add("is-over-footer")
    } else {
      dragClone?.classList.remove("is-over-footer")
    }

    if (dayEl) {
      const date = dayEl.dataset.dropDay as ISODate
      dropTargetDate.value = date
      pendingDrop.value = {taskId: draggingTaskId.value!, date}
    } else {
      dropTargetDate.value = null
      pendingDrop.value = null
    }
  }

  function onPointerUp() {
    if (pendingDrop.value) {
      const {taskId, date} = pendingDrop.value
      pendingDrop.value = null
      dropTargetDate.value = null
      if (date !== tasksStore.activeDay) {
        tasksStore.moveTask(taskId, date)
      }
    }
    cleanup()
  }

  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp, true)
    dropTargetDate.value = null
    pendingDrop.value = null
    findDragClone()?.classList.remove("is-over-footer")
  }

  watch(draggingTaskId, (id) => {
    if (id) {
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp, true)
    } else {
      cleanup()
    }
  })

  onScopeDispose(cleanup)
}
