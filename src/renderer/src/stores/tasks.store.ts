import {computed, ref, watch} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {objectFilter} from "@shared/utils/objects/filter"
import {getPreviousTaskOrderIndex, sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"
import {useDeletedTasksStore} from "@/stores/deletedTasks.store"
import {useSettingsStore} from "@/stores/settings.store"
import {perfMark, perfMeasure} from "@/utils/perf"
import {mergeDays, updateDays} from "@/utils/tasks/updateDays"
import {toRawDeep} from "@/utils/ui/vue"

import {API} from "@/api"

import type {TaskDropMode, TaskDropPosition, TaskMoveMeta} from "@/utils/tasks/reorderTasks"
import type {ISODate} from "@shared/types/common"
import type {Branch, Day, Tag, Task, TaskStatus} from "@shared/types/storage"

const INITIAL_RANGE_MONTHS = 6
const EXTEND_RANGE_MONTHS = 3
const EDGE_BUFFER_DAYS = 21

function addMonths(date: ISODate, months: number): ISODate {
  return DateTime.fromISO(date).plus({months}).toISODate()!
}

function diffDays(a: ISODate, b: ISODate): number {
  return DateTime.fromISO(a).diff(DateTime.fromISO(b), "days").days
}

export const useTasksStore = defineStore("tasks", () => {
  const settingsStore = useSettingsStore()
  const isDaysLoaded = ref(false)
  const days = ref<Day[]>([])
  const activeDay = ref<ISODate>(DateTime.now().toISODate()!)
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId)
  const emptyTasksByStatus: Record<TaskStatus, Task[]> = {active: [], discarded: [], done: []}

  const loadedRange = ref<{from: ISODate; to: ISODate} | null>(null)
  const pendingExtend = ref<"past" | "future" | null>(null)

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

  function setActiveDay(date: ISODate) {
    activeDay.value = date
    ensureRangeForDate(date)
  }

  async function getTaskList() {
    await loadInitialRange()
  }

  async function loadInitialRange() {
    isDaysLoaded.value = false
    perfMark("loadInitialRange:start")

    const today = DateTime.now().toISODate()!
    const from = addMonths(today, -INITIAL_RANGE_MONTHS)
    const to = addMonths(today, INITIAL_RANGE_MONTHS)

    try {
      const result = await API.getDays({from, to, branchId: activeBranchId.value})
      console.log("[TASKS] Loaded tasks (range):", result.length, `[${from} → ${to}]`)
      days.value = result
      loadedRange.value = {from, to}
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      isDaysLoaded.value = true
      perfMeasure("loadInitialRange", "loadInitialRange:start")
    }
  }

  async function ensureRangeForDate(date: ISODate) {
    const range = loadedRange.value
    if (!range) return

    const daysPastStart = diffDays(date, range.from)
    const daysBeforeEnd = diffDays(range.to, date)

    if (daysPastStart < -EDGE_BUFFER_DAYS || daysBeforeEnd < -EDGE_BUFFER_DAYS) {
      await recenterRange(date)
      return
    }

    if (daysPastStart < EDGE_BUFFER_DAYS) {
      void extendRange("past")
    } else if (daysBeforeEnd < EDGE_BUFFER_DAYS) {
      void extendRange("future")
    }
  }

  async function recenterRange(date: ISODate) {
    perfMark("recenterRange:start")
    const from = addMonths(date, -INITIAL_RANGE_MONTHS)
    const to = addMonths(date, INITIAL_RANGE_MONTHS)

    try {
      const result = await API.getDays({from, to, branchId: activeBranchId.value})
      days.value = result
      loadedRange.value = {from, to}
      console.log("[TASKS] Re-centered range:", `[${from} → ${to}]`)
    } catch (error) {
      console.error("Failed to re-center range:", error)
    } finally {
      perfMeasure("recenterRange", "recenterRange:start")
    }
  }

  async function extendRange(direction: "past" | "future") {
    if (pendingExtend.value === direction) return
    const range = loadedRange.value
    if (!range) return

    pendingExtend.value = direction
    perfMark("extendRange:start")

    const from = direction === "past" ? addMonths(range.from, -EXTEND_RANGE_MONTHS) : range.to
    const to = direction === "future" ? addMonths(range.to, EXTEND_RANGE_MONTHS) : range.from

    try {
      const result = await API.getDays({
        from: direction === "past" ? from : range.to,
        to: direction === "future" ? to : range.from,
        branchId: activeBranchId.value,
      })
      days.value = mergeDays(days.value, result)
      loadedRange.value = {
        from: direction === "past" ? from : range.from,
        to: direction === "future" ? to : range.to,
      }
      console.log("[TASKS] Extended range", direction, `[${loadedRange.value.from} → ${loadedRange.value.to}]`)
    } catch (error) {
      console.error("Failed to extend range:", error)
    } finally {
      pendingExtend.value = null
      perfMeasure("extendRange", "extendRange:start")
    }
  }

  watch(
    () => activeBranchId.value,
    (newId, oldId) => {
      if (newId !== oldId && isDaysLoaded.value) {
        void loadInitialRange()
      }
    },
  )

  async function refreshDay(date: ISODate) {
    perfMark("refreshDay:start")
    try {
      const day = await API.getDay(date)
      if (day) {
        days.value = updateDays(days.value, day)
      } else {
        days.value = days.value.filter((d) => d.date !== date)
      }
    } catch (error) {
      console.error("Failed to refresh day:", error)
    } finally {
      perfMeasure("refreshDay", "refreshDay:start")
    }
  }

  async function refreshDays(dates: ISODate[]) {
    perfMark("refreshDays:start")
    const unique = [...new Set(dates)]
    await Promise.all(unique.map((d) => refreshDay(d)))
    perfMeasure("refreshDays", "refreshDays:start")
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
        orderIndex: getPreviousTaskOrderIndex(dailyTasks.value),
        branchId: activeBranchId.value,
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

  async function toggleTaskMinimized(taskId: string, minimized: boolean) {
    const updatedDay = await API.toggleTaskMinimized(taskId, minimized)
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

    useDeletedTasksStore().revalidate()

    return true
  }

  async function revalidate() {
    const range = loadedRange.value
    if (!range) return

    try {
      const result = await API.getDays({from: range.from, to: range.to, branchId: activeBranchId.value})
      days.value = result
      console.log("tasks revalidated (scoped to range)")
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

    const sourceDate = task.scheduled.date

    const isSuccess = await API.moveTask(taskId, targetDate)
    if (!isSuccess) return false

    await refreshDays([sourceDate, targetDate])

    return true
  }

  async function moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const taskDate = task.scheduled.date

    const isSuccess = await API.moveTaskToBranch(taskId, branchId)
    if (!isSuccess) return false

    await refreshDay(taskDate)
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
        await refreshDay(activeDay.value)
        return null
      }

      days.value = updateDays(days.value, nextDay)
    } catch (error) {
      console.error("Failed to reorder tasks", error)
      await refreshDay(activeDay.value)
      return null
    }

    return meta
  }

  return {
    isDaysLoaded,
    days,
    activeDay,
    dailyTasks,
    dailyTasksByStatus,
    dailyTaskIndexMap,
    dailyTaskIndexMapByStatus,
    dailyTags,
    activeDayInfo,

    setActiveDay,
    getTaskList,
    findDailyTaskById,
    findTaskById,
    createTask,
    updateTask,
    toggleTaskMinimized,
    deleteTask,
    moveTask,
    moveTaskToBranch,
    moveTaskByOrder,
    revalidate,
    emptyTasksByStatus,
  }
})
