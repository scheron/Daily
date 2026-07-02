import {ref} from "vue"
import {defineStore} from "pinia"

import {useTasksStore} from "./tasks"

import type {ISODate} from "@shared/types/common"
import type {Task} from "@shared/types/storage"

export const useDragDropStore = defineStore("dragDrop", () => {
  const tasksStore = useTasksStore()

  const draggingTaskId = ref<Task["id"] | null>(null)
  const dropTargetDate = ref<ISODate | null>(null)

  function setDraggingTaskId(id: Task["id"] | null) {
    draggingTaskId.value = id
  }

  function setDropTargetDate(date: ISODate | null) {
    dropTargetDate.value = date
  }

  function dropOnDay(taskId: Task["id"], date: ISODate) {
    if (date !== tasksStore.activeDay) tasksStore.moveTask(taskId, date)
  }

  return {
    draggingTaskId,
    dropTargetDate,

    setDraggingTaskId,
    setDropTargetDate,
    dropOnDay,
  }
})
