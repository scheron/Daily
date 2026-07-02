import {computed, ref, watch} from "vue"
import {DateTime} from "luxon"
import {defineStore} from "pinia"

import {deepClone} from "@shared/utils/common/deepClone"
import {isNull, notNull} from "@shared/utils/common/validators"

import {API} from "@/api"
import {buildRestPatch} from "./utils/buildRestPatch"
import {shallowEqualDraft} from "./utils/shallowEqualDraft"
import {useTasksStore} from "../tasks"

import type {TaskDraft} from "@/types/tasks"
import type {ISODate} from "@shared/types/common"
import type {Branch, Task} from "@shared/types/storage"

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

  function openNew(params: {date: ISODate; branchId: Branch["id"] | null}) {
    seedNew(params)
  }

  function patch(updates: Partial<TaskDraft>) {
    if (!draft.value) return
    draft.value = {...draft.value, ...updates}
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
        date: next.scheduled.date,
        branchId: next.branchId ?? undefined,
        status: next.status,
      })
      draftBase.value = deepClone(next)
      return
    }

    const id = editingTaskId.value
    const base = draftBase.value

    if (base) {
      if (next.scheduled.date !== base.scheduled.date) await tasksStore.moveTask(id, next.scheduled.date)
      if (next.branchId !== base.branchId) await tasksStore.moveTaskToBranch(id, next.branchId ?? "")

      const restPatch = buildRestPatch(next, base)
      if (Object.keys(restPatch).length) await tasksStore.updateTask(id, restPatch)
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
      scheduled: {...task.scheduled},
    }
    draft.value = next
    draftBase.value = deepClone(next)
    editingTaskId.value = task.id
  }

  function seedNew(params: {date: ISODate; branchId: Branch["id"] | null}) {
    const now = DateTime.now()
    draft.value = {
      content: "",
      tags: [],
      estimatedTime: 0,
      spentTime: 0,
      status: "active",
      branchId: params.branchId,
      scheduled: {
        date: params.date,
        time: now.toFormat("HH:mm:ss"),
        timezone: now.zoneName ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
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
