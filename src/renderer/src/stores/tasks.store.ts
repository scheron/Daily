import {computed, ref} from "vue"
import {API} from "@/api"
import {objectFilter} from "@/utils/objects"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import type {ISODate} from "@/types/date"
import type {Day, Task} from "@/types/tasks"

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

  async function createTask(content: string) {
    const updatedDay = await API.createTask(content, {
      date: activeDay.value,
      time: DateTime.now().toFormat("HH:mm"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })

    if (!updatedDay) return false

    updateDayInStore(updatedDay)
    return true
  }

  async function updateTask(taskId: string, updates: {content?: string; done?: boolean}) {
    const payload = objectFilter(updates, (value) => value !== undefined)
    const updatedDay = await API.updateTask(taskId, payload)
    if (!updatedDay) return false

    updateDayInStore(updatedDay)
    return true
  }

  async function deleteTask(taskId: string) {
    const task = findTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.deleteTask(taskId)
    if (!isSuccess) return false

    const dayIndex = days.value.findIndex((day) => day.date === task.scheduled.date)
    if (dayIndex === -1) return false

    lastDeletedTasks.value.set(task.id, task)

    const updatedDay = days.value[dayIndex]
    updatedDay.tasks = updatedDay.tasks.filter((t) => t.id !== taskId)
    updatedDay.countActive = updatedDay.tasks.filter((t) => !t.done).length
    updatedDay.countDone = updatedDay.tasks.length - updatedDay.countActive

    updateDayInStore(updatedDay)

    return true
  }

  async function restoreTask(taskId: string) {
    if (!lastDeletedTasks.value.size) return false

    const task = lastDeletedTasks.value.get(taskId)
    if (!task) return false

    const isSuccess = await createTask(task.content)

    if (isSuccess) {
      lastDeletedTasks.value.delete(taskId)
      return true
    }

    return false
  }

  async function updateDayTitle(date: Day["date"], subtitle: Day["subtitle"]) {
    const updatedDay = await API.updateDay(date, {subtitle})
    if (!updatedDay) return false

    updateDayInStore(updatedDay)
    return true
  }

  function findTaskById(taskId: string): Task | null {
    const tasks = days.value.flatMap((day) => day.tasks)
    return tasks.find((t) => t.id === taskId) || null
  }

  function updateDayInStore(updatedDay: Day) {
    const dayIndex = days.value.findIndex((day) => day.date === updatedDay.date)

    if (dayIndex === -1) days.value.push(updatedDay)
    else days.value[dayIndex] = updatedDay
  }

  return {
    isDaysLoaded,
    days,
    activeDay,
    dailyTasks,
    activeDayInfo,
    lastDeletedTasks,

    setActiveDay,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    updateDayTitle,
    restoreTask,
  }
})
