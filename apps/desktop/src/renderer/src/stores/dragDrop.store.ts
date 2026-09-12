import {ref} from "vue"
import {defineStore} from "pinia"

import {useTasksStore} from "./tasks"

import type {ISODate, Milestone, Task} from "@daily/protocol"

export const useDragDropStore = defineStore("dragDrop", () => {
  const tasksStore = useTasksStore()

  const draggingTaskId = ref<Task["id"] | null>(null)
  const dropTargetDate = ref<ISODate | null>(null)
  const dropTargetMilestoneId = ref<Milestone["id"] | null>(null)
  const releasedInsideDropZone = ref(false)

  function setDraggingTaskId(id: Task["id"] | null) {
    draggingTaskId.value = id
    if (id) releasedInsideDropZone.value = false
  }

  /**
   * Records that the drag was released inside a drop zone floating over the board. The board
   * must then discard the column move SortableJS staged while the pointer travelled to it.
   */
  function setReleasedInsideDropZone(value: boolean) {
    releasedInsideDropZone.value = value
  }

  function setDropTargetDate(date: ISODate | null) {
    dropTargetDate.value = date
  }

  function setDropTargetMilestoneId(id: Milestone["id"] | null) {
    dropTargetMilestoneId.value = id
  }

  function dropOnDay(taskId: Task["id"], date: ISODate) {
    if (date !== tasksStore.activeDay) tasksStore.moveTask(taskId, date)
  }

  function dropOnMilestone(taskId: Task["id"], milestoneId: Milestone["id"]) {
    const task = tasksStore.findTaskById(taskId)
    if (task?.milestoneId === milestoneId) return
    tasksStore.updateTask(taskId, {milestoneId})
  }

  return {
    draggingTaskId,
    dropTargetDate,
    dropTargetMilestoneId,
    releasedInsideDropZone,

    setDraggingTaskId,
    setDropTargetDate,
    setDropTargetMilestoneId,
    setReleasedInsideDropZone,
    dropOnDay,
    dropOnMilestone,
  }
})
