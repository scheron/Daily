import {computed, onScopeDispose, ref, watch} from "vue"
import {toasts} from "vue-toasts-lite"

import {useStorageStore} from "@/stores/storage.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"

import {API} from "@/api"

import type {ISODate} from "@shared/types/common"
import type {Task, TaskEvent} from "@shared/types/storage"

export function useActivityModel() {
  const tasksStore = useTasksStore()
  const taskEditorStore = useTaskEditorStore()
  const storageStore = useStorageStore()

  const events = ref<TaskEvent[]>([])
  const restorableIds = ref<Set<Task["id"]>>(new Set())

  const activeDaySignature = computed(() => {
    const day = tasksStore.days.find((d) => d.date === tasksStore.activeDay)
    return (day?.tasks ?? []).map((t) => `${t.id}:${t.status}:${t.scheduled.date}:${t.updatedAt}`).join("|")
  })

  function goToDay(date: ISODate) {
    tasksStore.setActiveDay(date)
  }

  function openTask(event: TaskEvent) {
    if (event.type === "deleted") return
    taskEditorStore.open(event.taskId)
  }

  function isRestorable(event: TaskEvent): boolean {
    return event.type === "deleted" && restorableIds.value.has(event.taskId)
  }

  async function restore(event: TaskEvent): Promise<void> {
    const restored = await API.restoreTask(event.taskId)
    if (!restored) {
      toasts.error("Task can no longer be restored")
      return
    }

    await tasksStore.revalidate()
    await revalidate()
  }

  async function revalidate(): Promise<void> {
    const [activity, deleted] = await Promise.all([API.getActivityByDay(tasksStore.activeDay), API.getDeletedTasks()])
    events.value = activity
    restorableIds.value = new Set(deleted.map((task) => task.id))
  }

  watch([() => tasksStore.activeDay, activeDaySignature], revalidate, {immediate: true})
  const {off} = storageStore.onStorageDataChanged(revalidate)

  onScopeDispose(off)

  return {
    events,

    goToDay,
    openTask,
    isRestorable,
    restore,
  }
}
