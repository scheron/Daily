import {ref} from "vue"
import {defineStore} from "pinia"

import {useTasksStore} from "./tasks"

import type {ISODate, Milestone, Task} from "@daily/protocol"

export const useDragDropStore = defineStore("dragDrop", () => {
  const tasksStore = useTasksStore()

  const draggingTaskId = ref<Task["id"] | null>(null)
  const dropTargetDate = ref<ISODate | null>(null)
  const dropTargetMilestoneId = ref<Milestone["id"] | null>(null)
  const isReleasedInsideDropZone = ref(false)
  const isOverDropZone = ref(false)

  function setDraggingTaskId(id: Task["id"] | null) {
    draggingTaskId.value = id
    if (id) isReleasedInsideDropZone.value = false
  }

  /**
   * Tracks whether the pointer currently hovers a drop zone floating over the board. The dragged
   * task's preview shrinks to a pill while it does, so the zone underneath stays readable.
   */
  function setOverDropZone(isOver: boolean) {
    isOverDropZone.value = isOver
  }

  /**
   * Records that the drag was released inside a drop zone floating over the board. The board
   * must then write no column move, even when a column lies under the zone.
   */
  function setReleasedInsideDropZone(isReleased: boolean) {
    isReleasedInsideDropZone.value = isReleased
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
    isReleasedInsideDropZone,
    isOverDropZone,

    setDraggingTaskId,
    setDropTargetDate,
    setDropTargetMilestoneId,
    setReleasedInsideDropZone,
    setOverDropZone,
    dropOnDay,
    dropOnMilestone,
  }
})
