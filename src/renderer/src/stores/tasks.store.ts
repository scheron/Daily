import {computed, ref} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {API} from "@/api"
import {objectFilter} from "@/utils/objects"
import {updateDays} from "@/utils/tasks"
import {toRawDeep} from "@/utils/vue"

import type {ISODate} from "@/types/date"
import type {Day, Tag, Task} from "@/types/tasks"

export const useTasksStore = defineStore("tasks", () => {
  const isDaysLoaded = ref(false)
  const days = ref<Day[]>([])
  const activeDay = ref<ISODate>(DateTime.now().toISODate()!)
  const lastDeletedTasks = ref<Map<string, Task>>(new Map())

  const activeDayInfo = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? day : {date: activeDay.value, subtitle: ""}
  })

  const dailyTasks = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? day.tasks : []
  })

  const dailyTags = computed(() => {
    const day = days.value.find((day) => day.date === activeDay.value)
    return day ? day.tags : []
  })

  function setActiveDay(date: ISODate) {
    activeDay.value = date
  }

  async function loadTasks() {
    isDaysLoaded.value = false
    try {
      const dailyTasks = await API.getDays()
      days.value = dailyTasks
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      isDaysLoaded.value = true
    }
  }

  async function createTask(content: string, tags: Tag[] = []) {
    const updatedDay = await API.createTask(
      content,
      toRawDeep({
        date: activeDay.value,
        time: DateTime.now().toFormat("HH:mm"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tags,
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
    const task = findTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.deleteTask(taskId)
    if (!isSuccess) return false

    const dayIndex = days.value.findIndex((day) => day.date === activeDay.value)
    if (dayIndex === -1) return false

    lastDeletedTasks.value.set(task.id, task)

    const dayWithRemovedTask = {...days.value[dayIndex]}
    dayWithRemovedTask.tasks = dayWithRemovedTask.tasks.filter((t) => t.id !== taskId)

    days.value = updateDays(days.value, dayWithRemovedTask)

    return true
  }

  async function restoreTask(taskId: string) {
    if (!lastDeletedTasks.value.size) return false

    const task = lastDeletedTasks.value.get(taskId)
    if (!task) return false

    const isSuccess = await createTask(task.content, task.tags)

    if (isSuccess) {
      lastDeletedTasks.value.delete(taskId)
      return true
    }

    return false
  }

  async function updateDayTitle(date: Day["date"], subtitle: Day["subtitle"]) {
    const updatedDay = await API.updateDay(date, {subtitle})
    if (!updatedDay) return false

    days.value = updateDays(days.value, updatedDay)
    return true
  }

  async function revalidateTasks() {
    const dailyTasks = await API.getDays()
    days.value = dailyTasks
  }

  function findTaskById(taskId: string): Task | null {
    return dailyTasks.value.find((t) => t.id === taskId) || null
  }

  return {
    isDaysLoaded,
    days,
    activeDay,
    dailyTasks,
    dailyTags,
    activeDayInfo,
    lastDeletedTasks,

    setActiveDay,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    updateDayTitle,
    restoreTask,
    revalidateTasks,
  }
})
