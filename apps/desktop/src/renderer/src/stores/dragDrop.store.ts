import {ref} from "vue"
import {defineStore} from "pinia"

import {getTime, getTimezone} from "@daily/std"

import {useTasksStore} from "./tasks"

import type {ISODate, Task} from "@daily/protocol"

export const useDragDropStore = defineStore("dragDrop", () => {
  const tasksStore = useTasksStore()

  const draggingTaskId = ref<Task["id"] | null>(null)
  const dropTargetDate = ref<ISODate | null>(null)
  const dayDropHandled = ref(false)

  function setDraggingTaskId(id: Task["id"] | null) {
    draggingTaskId.value = id
    if (id) dayDropHandled.value = false
  }

  function setDropTargetDate(date: ISODate | null) {
    dropTargetDate.value = date
  }

  async function dropOnDay(taskId: Task["id"], date: ISODate) {
    dayDropHandled.value = true

    const task = tasksStore.findTaskById(taskId)

    if (!task) {
      const restored = await tasksStore.restoreTask(taskId, date)
      if (restored && !restored.scheduled) await tasksStore.scheduleTask(taskId, {date, time: getTime(), timezone: getTimezone()})
      return
    }

    if (!task.scheduled) {
      await tasksStore.scheduleTask(taskId, {date, time: getTime(), timezone: getTimezone()})
      return
    }

    if (date !== tasksStore.activeDay) await tasksStore.moveTask(taskId, date)
  }

  return {
    draggingTaskId,
    dropTargetDate,
    dayDropHandled,

    setDraggingTaskId,
    setDropTargetDate,
    dropOnDay,
  }
})
