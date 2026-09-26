import {onScopeDispose, ref, watch} from "vue"
import {storeToRefs} from "pinia"

import {useBoardDrop} from "@/composables/tasks/useBoardDrop"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFocusStore} from "@/stores/focus.store"
import {useTasksStore} from "@/stores/tasks"
import {findClosestAtPoint} from "@/utils/ui/dom"
import {findRowGap} from "../utils/findRowGap"

import type {Task} from "@daily/protocol"
import type {ShallowRef} from "vue"

export function useCardDrop(listRef: Readonly<ShallowRef<HTMLElement | null>>) {
  const dragDropStore = useDragDropStore()
  const focusStore = useFocusStore()
  const tasksStore = useTasksStore()

  const {draggingTaskId} = storeToRefs(dragDropStore)

  const dropIndex = ref<number | null>(null)

  useBoardDrop()

  function onPointerMove(event: PointerEvent) {
    const isOverDock = Boolean(findClosestAtPoint(event.clientX, event.clientY, "[data-focus-drop-zone]"))
    dropIndex.value = isOverDock && canAdd(draggingTaskId.value) ? findRowGap(listRef.value, event.clientY) : null
  }

  function onPointerUp() {
    const taskId = draggingTaskId.value
    const index = dropIndex.value
    stop()
    if (taskId && index !== null) focusStore.dispatch({type: "add", taskId, index})
  }

  function canAdd(taskId: Task["id"] | null) {
    const task = taskId ? tasksStore.findTaskById(taskId) : null
    if (!task || focusStore.session?.tasks.some((sessionTask) => sessionTask.taskId === task.id)) return false
    return task.status === "active" || task.status === "backlog"
  }

  function stop() {
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp, true)
    dropIndex.value = null
  }

  watch(draggingTaskId, (id) => {
    if (!id) {
      stop()
      return
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp, true)
  })

  onScopeDispose(stop)

  return {dropIndex}
}
