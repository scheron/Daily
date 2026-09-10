import {computed, ref, watch} from "vue"
import {defineStore} from "pinia"

import {deepClone, isNull, notNull} from "@daily/std"

import {API} from "@/api"
import {crossesBacklog, useTasksStore} from "@/stores/tasks"
import {buildRestPatch} from "./utils/buildRestPatch"
import {shallowEqualDraft} from "./utils/shallowEqualDraft"

import type {TaskDraft} from "@/types/tasks"
import type {Branch, Task} from "@daily/protocol"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const tasksStore = useTasksStore()

  const draft = ref<TaskDraft | null>(null)
  const draftBase = ref<TaskDraft | null>(null)
  const editingTaskId = ref<Task["id"] | null>(null)

  const isOpen = computed(() => notNull(draft.value))
  const isNew = computed(() => isNull(editingTaskId.value) && notNull(draft.value))
  const isDirty = computed(() => {
    if (!draft.value) return false
    if (!draftBase.value) return hasContent(draft.value)
    return !shallowEqualDraft(draft.value, draftBase.value)
  })
  const editingTask = computed(() => (notNull(editingTaskId.value) ? tasksStore.findTaskById(editingTaskId.value) : null))

  async function open(taskId: Task["id"]) {
    const task = tasksStore.findTaskById(taskId) ?? (await API.getTask(taskId))
    if (!task || notNull(task.deletedAt)) return
    seedFrom(task)
  }

  function openNew(params: {branchId: Branch["id"] | null}) {
    seedNew(params)
  }

  function patch(updates: Partial<TaskDraft>) {
    if (!draft.value) return
    const next = {...draft.value, ...updates}

    if (updates.status === "backlog") next.scheduled = null
    else if (updates.scheduled && draft.value.status === "backlog") next.status = "active"

    draft.value = next
  }

  function discard() {
    if (!draft.value) return
    if (!draftBase.value) {
      clear()
      return
    }
    draft.value = deepClone(draftBase.value)
  }

  async function commit() {
    if (!draft.value) return
    const next = draft.value

    if (isNull(editingTaskId.value)) {
      await tasksStore.createTask({
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        date: next.scheduled?.date,
        branchId: next.branchId ?? undefined,
        status: next.status,
      })
      draftBase.value = deepClone(next)
      return
    }

    const id = editingTaskId.value
    const base = draftBase.value

    if (base) {
      const resolvedWithoutDate = next.status !== "backlog" && !next.scheduled
      const restPatch = buildRestPatch(next, base)

      if (next.branchId !== base.branchId) await tasksStore.moveTaskToBranch(id, next.branchId ?? "")

      if (resolvedWithoutDate) {
        if (Object.keys(restPatch).length) await tasksStore.updateTask(id, restPatch)
        await tasksStore.moveTaskByOrder({taskId: id, targetStatus: next.status, activeDate: tasksStore.activeDay})
      } else {
        const scheduleChanged = Boolean(next.scheduled) && next.scheduled?.date !== base.scheduled?.date

        if (scheduleChanged && "status" in restPatch) {
          await tasksStore.updateTask(id, {...restPatch, scheduled: next.scheduled})
        } else {
          if (Object.keys(restPatch).length) await tasksStore.updateTask(id, restPatch)
          if (scheduleChanged && next.scheduled) await tasksStore.moveTask(id, next.scheduled.date)
        }

        if (crossesBacklog(base.status, next.status)) await tasksStore.refreshBacklog()
      }
    } else {
      await tasksStore.updateTask(id, {
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        spentTime: next.spentTime,
        status: next.status,
      })
    }

    draftBase.value = deepClone(next)
  }

  async function commitAndClose() {
    await commit()
    clear()
  }

  function clear() {
    draft.value = null
    draftBase.value = null
    editingTaskId.value = null
  }

  function seedFrom(task: Task) {
    const next: TaskDraft = {
      content: task.content,
      tags: [...task.tags],
      estimatedTime: task.estimatedTime,
      spentTime: task.spentTime,
      status: task.status,
      branchId: task.branchId || null,
      scheduled: task.scheduled ? {...task.scheduled} : null,
    }
    draft.value = next
    draftBase.value = deepClone(next)
    editingTaskId.value = task.id
  }

  function seedNew(params: {branchId: Branch["id"] | null}) {
    draft.value = {
      content: "",
      tags: [],
      estimatedTime: 0,
      spentTime: 0,
      status: "backlog",
      branchId: params.branchId,
      scheduled: null,
    }
    draftBase.value = null
    editingTaskId.value = null
  }
  function hasContent(d: TaskDraft): boolean {
    return Boolean(d.content.trim().length || d.tags.length || d.estimatedTime || d.spentTime)
  }

  watch(
    () => editingTask.value?.updatedAt ?? null,
    (updatedAt) => {
      if (isNull(updatedAt) || isDirty.value) return
      if (editingTask.value) seedFrom(editingTask.value)
    },
  )

  return {
    draft,
    editingTaskId,
    isOpen,
    isNew,
    isDirty,

    open,
    openNew,
    patch,
    discard,
    commit,
    commitAndClose,
    clear,
  }
})
