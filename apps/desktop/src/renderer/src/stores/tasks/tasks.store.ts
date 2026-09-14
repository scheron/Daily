import {computed, ref} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {groupTasksByDay, sortTasksByOrderIndex} from "@daily/protocol"

import {API} from "@/api"
import {useSettingsStore} from "@/stores/settings.store"
import {useTaskMutations} from "./composables/useTaskMutations"
import {applyChangeset as applyChangesetTo} from "./applyChangeset"

import type {Changeset} from "@daily/core"
import type {Day, ISODate, Milestone, Task, TaskStatus} from "@daily/protocol"

export const useTasksStore = defineStore("tasks", () => {
  const settingsStore = useSettingsStore()

  const tasks = ref<Task[]>([])
  const isLoaded = ref(false)

  const activeDay = ref<ISODate>(DateTime.now().toISODate()!)
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId)

  const projectTasks = computed(() => tasks.value.filter((task) => task.branchId === activeBranchId.value))

  const days = computed<Day[]>(() => {
    const dated = projectTasks.value.filter((task) => task.scheduled)
    return groupTasksByDay({tasks: dated, tags: dated.flatMap((task) => task.tags)})
  })

  const backlogTasks = computed<Task[]>(() => sortTasksByOrderIndex(projectTasks.value.filter((task) => task.status === "backlog")))

  const tasksByMilestoneId = computed(() => {
    const map = new Map<Milestone["id"], Task[]>()
    for (const task of tasks.value) {
      if (!task.milestoneId) continue
      const list = map.get(task.milestoneId)
      if (list) list.push(task)
      else map.set(task.milestoneId, [task])
    }
    return map
  })

  const activeDayData = computed(() => days.value.find((day) => day.date === activeDay.value) ?? null)
  const activeDayInfo = computed(() => activeDayData.value ?? {date: activeDay.value})
  const dailyTasks = computed(() => (activeDayData.value ? sortTasksByOrderIndex(activeDayData.value.tasks) : []))
  const dailyTags = computed(() => activeDayData.value?.tags ?? [])

  const dailyTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    const grouped = dailyTasks.value.reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {active: [], discarded: [], done: [], backlog: []} as Record<TaskStatus, Task[]>,
    )
    grouped.backlog = backlogTasks.value
    return grouped
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
      backlog: new Map(dailyTasksByStatus.value.backlog.map((task, index) => [task.id, index])),
    }
  })

  const mutations = useTaskMutations({
    tasks,
    days,
    activeDay,
    activeBranchId,
    activeDayData,
    dailyTasks,
    backlogTasks,
    findTaskById,
  })

  function findTaskById(taskId: Task["id"]): Task | null {
    return tasks.value.find((task) => task.id === taskId) ?? null
  }

  function setActiveDay(date: ISODate) {
    activeDay.value = date
  }

  async function loadTasks() {
    isLoaded.value = false
    try {
      tasks.value = await API.getAllTasks()
    } catch (error) {
      console.error("Failed to load tasks:", error)
      throw error
    } finally {
      isLoaded.value = true
    }
  }

  function applyChangeset(changeset: Changeset): void {
    applyChangesetTo({tasks}, changeset)
  }

  async function revalidate() {
    await loadTasks()
  }

  return {
    isLoaded,
    tasks,
    days,
    backlogTasks,
    tasksByMilestoneId,
    activeDay,
    dailyTasks,
    dailyTasksByStatus,
    dailyTaskIndexMap,
    dailyTaskIndexMapByStatus,
    dailyTags,
    activeDayInfo,

    setActiveDay,
    findTaskById,
    loadTasks,
    applyChangeset,
    revalidate,

    ...mutations,
  }
})
