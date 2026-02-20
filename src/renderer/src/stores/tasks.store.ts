import {computed, ref} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {objectFilter} from "@shared/utils/objects/filter"
import {getNextTaskOrderIndex, sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"
import {updateDays} from "@/utils/tasks/updateDays"
import {toRawDeep} from "@/utils/ui/vue"

import {API} from "@/api"

import type {TaskDropMode, TaskDropPosition, TaskMoveMeta} from "@/utils/tasks/reorderTasks"
import type {ISODate} from "@shared/types/common"
import type {Day, Tag, Task, TaskStatus} from "@shared/types/storage"

export const useTasksStore = defineStore("tasks", () => {
  const isDaysLoaded = ref(false)
  const days = ref<Day[]>([])
  const activeDay = ref<ISODate>(DateTime.now().toISODate()!)

  const activeDayInfo = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? day : {date: activeDay.value}
  })

  const dailyTasks = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? sortTasksByOrderIndex(day.tasks) : []
  })

  const dailyTags = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? day.tags : []
  })

  function setActiveDay(date: ISODate) {
    activeDay.value = date
  }

  async function getTaskList() {
    isDaysLoaded.value = false

    try {
      const dailyTasks = await API.getDays()
      console.log("[TASKS] Loaded tasks:", dailyTasks)
      days.value = dailyTasks
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      isDaysLoaded.value = true
    }
  }

  async function createTask({content, tags, estimatedTime}: {content: string; tags: Tag[]; estimatedTime?: number}) {
    const updatedDay = await API.createTask(
      content,
      toRawDeep({
        date: activeDay.value,
        time: DateTime.now().toFormat("HH:mm:ss"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tags,
        estimatedTime: estimatedTime ?? 0,
        orderIndex: getNextTaskOrderIndex(dailyTasks.value),
      }),
    )

    if (!updatedDay) return false

    days.value = updateDays(days.value, updatedDay)
    return true
  }

  async function updateTask(taskId: string, updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>) {
    const payload = objectFilter(updates, (value) => value !== undefined)
    const updatedDay = await API.updateTask(taskId, toRawDeep(payload))
    if (!updatedDay) return false

    days.value = updateDays(days.value, updatedDay)
    return true
  }

  async function deleteTask(taskId: string) {
    const task = findDailyTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.deleteTask(taskId)
    if (!isSuccess) return false

    const dayIndex = days.value.findIndex((day) => day.date === activeDay.value)
    if (dayIndex === -1) return false

    const dayWithRemovedTask = {...days.value[dayIndex]}
    dayWithRemovedTask.tasks = dayWithRemovedTask.tasks.filter((t) => t.id !== taskId)

    days.value = updateDays(days.value, dayWithRemovedTask)

    return true
  }

  async function revalidate() {
    try {
      const dailyTasks = await API.getDays()
      days.value = dailyTasks
      console.log("tasks revalidated")
    } catch (error) {
      console.error("Error revalidating tasks:", error)
    }
  }

  function findDailyTaskById(taskId: string): Task | null {
    return dailyTasks.value.find((t) => t.id === taskId) || null
  }

  function findTaskById(taskId: string): Task | null {
    return days.value.flatMap((day) => day.tasks).find((t) => t.id === taskId) || null
  }

  async function moveTask(taskId: string, targetDate: ISODate) {
    const task = findDailyTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.moveTask(taskId, targetDate)
    if (!isSuccess) return false

    await revalidate()

    return true
  }

  async function moveTaskByOrder(params: {
    taskId: Task["id"]
    mode: TaskDropMode
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskDropPosition
  }): Promise<TaskMoveMeta | null> {
    const day = days.value.find((item) => item.date === activeDay.value)
    if (!day) return null

    const sourceTask = day.tasks.find((task) => task.id === params.taskId)
    if (!sourceTask) return null

    const targetTaskId = params.targetTaskId ?? null
    const position = params.position ?? "before"
    const toStatus = params.targetStatus ?? sourceTask.status

    const meta: TaskMoveMeta = {
      taskId: params.taskId,
      mode: params.mode,
      fromStatus: sourceTask.status,
      toStatus,
      targetTaskId,
      position,
    }

    if (targetTaskId === params.taskId && toStatus === sourceTask.status) {
      return meta
    }

    try {
      const nextDay = await API.moveTaskByOrder(
        toRawDeep({
          taskId: params.taskId,
          mode: params.mode,
          targetTaskId,
          targetStatus: params.targetStatus,
          position,
        }),
      )
      if (!nextDay) {
        await revalidate()
        return null
      }

      days.value = updateDays(days.value, nextDay)
    } catch (error) {
      console.error("Failed to reorder tasks", error)
      await revalidate()
      return null
    }

    return meta
  }

  return {
    isDaysLoaded,
    days,
    activeDay,
    dailyTasks,
    dailyTags,
    activeDayInfo,

    setActiveDay,
    getTaskList,
    findDailyTaskById,
    findTaskById,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    moveTaskByOrder,
    revalidate,
  }
})
