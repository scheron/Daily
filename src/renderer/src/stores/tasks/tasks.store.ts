import {computed, ref} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"
import {useSettingsStore} from "@/stores/settings.store"

import {useTaskMutations} from "./composables/useTaskMutations"
import {useTaskRange} from "./composables/useTaskRange"

import type {ISODate} from "@shared/types/common"
import type {Day, Task, TaskStatus} from "@shared/types/storage"

export const useTasksStore = defineStore("tasks", () => {
  const settingsStore = useSettingsStore()

  const days = ref<Day[]>([])
  const activeDay = ref<ISODate>(DateTime.now().toISODate()!)
  const isDaysLoaded = ref(false)
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId)

  const activeDayData = computed(() => days.value.find((day) => day.date === activeDay.value) ?? null)
  const activeDayInfo = computed(() => activeDayData.value ?? {date: activeDay.value})
  const dailyTasks = computed(() => (activeDayData.value ? sortTasksByOrderIndex(activeDayData.value.tasks) : []))
  const dailyTags = computed(() => activeDayData.value?.tags ?? [])

  const dailyTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    return dailyTasks.value.reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
    )
  })

  const dailyTaskIndexMap = computed(() => {
    const map = new Map<Task["id"], number>()
    dailyTasks.value.forEach((task, index) => map.set(task.id, index))
    return map
  })

  const dailyTaskIndexMapByStatus = computed<Record<TaskStatus, Map<Task["id"], number>>>(() => {
    return {
      active: new Map(dailyTasksByStatus.value.active.map((task, index) => [task.id, index])),
      discarded: new Map(dailyTasksByStatus.value.discarded.map((task, index) => [task.id, index])),
      done: new Map(dailyTasksByStatus.value.done.map((task, index) => [task.id, index])),
    }
  })

  const range = useTaskRange({days, activeDay, isDaysLoaded, activeBranchId})

  const mutations = useTaskMutations({
    days,
    activeDay,
    activeBranchId,
    activeDayData,
    dailyTasks,
    findTaskById,
    refreshDay: range.refreshDay,
    refreshDays: range.refreshDays,
  })

  function findTaskById(taskId: Task["id"]): Task | null {
    return days.value.flatMap((day) => day.tasks).find((t) => t.id === taskId) || null
  }

  function setActiveDay(date: ISODate) {
    activeDay.value = date
    range.ensureRangeForDate(date)
  }

  return {
    isDaysLoaded,
    days,
    activeDay,
    loadedRange: range.loadedRange,
    dailyTasks,
    dailyTasksByStatus,
    dailyTaskIndexMap,
    dailyTaskIndexMapByStatus,
    dailyTags,
    activeDayInfo,

    setActiveDay,
    getTaskList: range.getTaskList,
    extendRange: range.extendRange,
    findTaskById,
    revalidate: range.revalidate,

    ...mutations,
  }
})
