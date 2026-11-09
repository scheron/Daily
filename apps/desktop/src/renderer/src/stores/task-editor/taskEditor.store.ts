import {computed, ref, watch} from "vue"
import {defineStore} from "pinia"

import {statusForScheduling} from "@daily/protocol"
import {deepClone, isNull, notNull} from "@daily/std"

import {Storage} from "@/api"
import {useTaskRelationsStore} from "@/stores/task-relations"
import {useTasksStore} from "@/stores/tasks"
import {usePendingChildren} from "./composables/usePendingChildren"
import {buildRestPatch} from "./utils/buildRestPatch"
import {sameIds} from "./utils/sameIds"
import {shallowEqualDraft} from "./utils/shallowEqualDraft"

import type {TaskDraft} from "@/types/taskDraft"
import type {Branch, Milestone, Task, TaskRelationSets} from "@daily/protocol"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const tasksStore = useTasksStore()
  const taskRelationsStore = useTaskRelationsStore()

  const draft = ref<TaskDraft | null>(null)
  const draftBase = ref<TaskDraft | null>(null)
  const editingTaskId = ref<Task["id"] | null>(null)
  let dateExplicitlyCleared = false
  let pendingCommit: Promise<boolean> | null = null

  const pending = usePendingChildren({draft})
  const {pendingSubtasks, pendingComments, hasPending, clearPending, writePending} = pending

  const isOpen = computed(() => notNull(draft.value))
  const isNew = computed(() => isNull(editingTaskId.value) && notNull(draft.value))
  const isDirty = computed(() => {
    if (!draft.value) return false
    if (!draftBase.value) return hasContent(draft.value) || hasPending.value
    return !shallowEqualDraft(draft.value, draftBase.value)
  })
  const editingTask = computed(() => (notNull(editingTaskId.value) ? tasksStore.findTaskById(editingTaskId.value) : null))
  const editingTaskUpdatedAt = computed(() => editingTask.value?.updatedAt ?? null)
  const editingTaskSpentTime = computed(() => editingTask.value?.spentTime ?? null)
  const hasSpentTimeEdit = computed(() => draft.value?.spentTime !== draftBase.value?.spentTime)
  const editingTaskRelationIds = computed<TaskRelationSets | null>(() => {
    if (isNull(editingTaskId.value)) return null
    return relationIdsFor(editingTaskId.value)
  })

  async function open(taskId: Task["id"]) {
    const task = tasksStore.findTaskById(taskId) ?? (await Storage.getTask(taskId))
    if (!task || notNull(task.deletedAt)) return
    seedFrom(task)
  }

  function openNew(params: {branchId: Branch["id"] | null; milestoneId: Milestone["id"] | null}) {
    draft.value = {
      content: "",
      tags: [],
      estimatedTime: 0,
      spentTime: 0,
      status: "backlog",
      priority: "none",
      branchId: params.branchId,
      scheduled: null,
      milestoneId: params.milestoneId,
      blockedBy: [],
      blocks: [],
    }
    draftBase.value = null
    editingTaskId.value = null
    dateExplicitlyCleared = false
    clearPending()
  }

  function patch(updates: Partial<TaskDraft>) {
    if (!draft.value) return
    const next = {...draft.value, ...updates}

    if (updates.scheduled !== undefined) dateExplicitlyCleared = updates.scheduled === null

    if (updates.status === "backlog") next.scheduled = null
    else if (!updates.status && "scheduled" in updates) next.status = statusForScheduling(draft.value.status, updates.scheduled ?? null)

    if (updates.branchId !== undefined && updates.branchId !== draft.value.branchId) {
      if (updates.blockedBy === undefined) next.blockedBy = []
      if (updates.blocks === undefined) next.blocks = []
      if (updates.tags === undefined) next.tags = []
      if (updates.milestoneId === undefined) next.milestoneId = null
    }

    draft.value = next
  }

  function discard() {
    if (!draft.value) return
    if (!draftBase.value) {
      clear()
      return
    }
    const base = draftBase.value
    const restored = deepClone(base)
    dateExplicitlyCleared = false

    if (notNull(editingTaskId.value)) {
      const relationIds = relationIdsFor(editingTaskId.value)
      draft.value = {...restored, blockedBy: relationIds.blockedBy, blocks: relationIds.blocks}
      draftBase.value = {...base, blockedBy: [...relationIds.blockedBy], blocks: [...relationIds.blocks]}
    } else {
      draft.value = restored
    }
  }

  async function commit() {
    if (pendingCommit) return pendingCommit

    pendingCommit = writeDraft()
    try {
      return await pendingCommit
    } finally {
      pendingCommit = null
    }
  }

  async function commitAndClose() {
    const id = editingTaskId.value
    if ((await commit()) && editingTaskId.value === id && !isDirty.value) clear()
  }

  function clear() {
    draft.value = null
    draftBase.value = null
    editingTaskId.value = null
    dateExplicitlyCleared = false
    clearPending()
  }

  async function writeDraft(): Promise<boolean> {
    if (!draft.value) return false
    const next = draft.value

    if (isNull(editingTaskId.value)) {
      const created = await tasksStore.createTask({
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        date: next.scheduled?.date,
        branchId: next.branchId ?? undefined,
        status: next.status,
        priority: next.priority,
        milestoneId: next.milestoneId,
      })

      if (!created) return false

      if (next.blockedBy.length || next.blocks.length) {
        await taskRelationsStore.setTaskRelations(created.id, {blockedBy: next.blockedBy, blocks: next.blocks})
      }

      await writePending(created.id)

      draftBase.value = deepClone(next)
      return true
    }

    const id = editingTaskId.value
    const base = draftBase.value

    if (base) {
      const needsDate = next.status !== "backlog" && next.status !== "ready_for_agent" && !next.scheduled
      const restPatch = buildRestPatch(next, base)
      const spentTimeDelta = next.spentTime - base.spentTime
      const adjustment: [spentTimeDelta?: number] = spentTimeDelta === 0 ? [] : [spentTimeDelta]
      const shouldWriteDate = next.scheduled?.date !== base.scheduled?.date && (next.status !== "backlog" || dateExplicitlyCleared)
      const writesDateWithPatch = !needsDate && shouldWriteDate && ("status" in restPatch || next.scheduled === null)
      const updates = writesDateWithPatch ? {...restPatch, scheduled: next.scheduled} : restPatch

      if (next.branchId !== base.branchId) await tasksStore.moveTaskToBranch(id, next.branchId ?? "")

      if ((adjustment.length || Object.keys(updates).length) && (await tasksStore.updateTask(id, updates, ...adjustment)) === false) return false

      if (needsDate) {
        await tasksStore.moveTaskByOrder({taskId: id, targetStatus: next.status, activeDate: tasksStore.activeDay})
      } else if (shouldWriteDate && !writesDateWithPatch && next.scheduled) {
        await tasksStore.moveTask(id, next.scheduled.date)
      }

      if (!sameIds(next.blockedBy, base.blockedBy) || !sameIds(next.blocks, base.blocks)) {
        await taskRelationsStore.setTaskRelations(id, {blockedBy: next.blockedBy, blocks: next.blocks})
      }
    } else {
      const updated = await tasksStore.updateTask(id, {
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        spentTime: next.spentTime,
        status: next.status,
        priority: next.priority,
        milestoneId: next.milestoneId,
      })
      if (updated === false) return false
      await taskRelationsStore.setTaskRelations(id, {blockedBy: next.blockedBy, blocks: next.blocks})
    }

    if (editingTaskId.value !== id || !draft.value) return true

    const saved = deepClone(next)
    if (base && next.spentTime !== base.spentTime) {
      saved.spentTime = editingTaskSpentTime.value ?? next.spentTime
      const remainingEdit = draft.value.spentTime - next.spentTime
      draft.value = {...draft.value, spentTime: Math.max(0, saved.spentTime + remainingEdit)}
    } else if (base) {
      saved.spentTime = draftBase.value?.spentTime ?? next.spentTime
    }
    draftBase.value = saved
    return true
  }

  function seedFrom(task: Task) {
    const relationIds = relationIdsFor(task.id)
    const next: TaskDraft = {
      content: task.content,
      tags: [...task.tags],
      estimatedTime: task.estimatedTime,
      spentTime: task.spentTime,
      status: task.status,
      priority: task.priority,
      branchId: task.branchId || null,
      scheduled: task.scheduled ? {...task.scheduled} : null,
      milestoneId: task.milestoneId,
      blockedBy: relationIds.blockedBy,
      blocks: relationIds.blocks,
    }
    draft.value = next
    draftBase.value = deepClone(next)
    editingTaskId.value = task.id
    dateExplicitlyCleared = false
  }

  function hasContent(d: TaskDraft): boolean {
    return Boolean(d.content.trim().length || d.tags.length || d.estimatedTime || d.spentTime)
  }

  function relationIdsFor(taskId: Task["id"]): TaskRelationSets {
    const related = taskRelationsStore.relatedTasksByTaskId.get(taskId)
    return {
      blockedBy: related ? related.blockedBy.map((task) => task.id) : [],
      blocks: related ? related.blocks.map((task) => task.id) : [],
    }
  }

  watch(editingTaskUpdatedAt, (updatedAt) => {
    if (isNull(updatedAt) || isDirty.value) return
    if (editingTask.value) seedFrom(editingTask.value)
  })

  watch([editingTaskSpentTime, hasSpentTimeEdit], ([spentTime, hasEdit]) => {
    const current = draft.value
    const base = draftBase.value
    if (spentTime === null || !current || !base || base.spentTime === spentTime || (hasEdit && pendingCommit)) return

    draft.value = {...current, spentTime: Math.max(0, spentTime + current.spentTime - base.spentTime)}
    draftBase.value = {...base, spentTime}
  })

  watch(editingTaskRelationIds, (ids) => {
    if (!ids || !draft.value || !draftBase.value || isDirty.value) return
    if (sameIds(ids.blockedBy, draft.value.blockedBy) && sameIds(ids.blocks, draft.value.blocks)) return

    draft.value = {...draft.value, blockedBy: ids.blockedBy, blocks: ids.blocks}
    draftBase.value = {...draftBase.value, blockedBy: [...ids.blockedBy], blocks: [...ids.blocks]}
  })

  return {
    draft,
    editingTaskId,
    isOpen,
    isNew,
    isDirty,
    pendingSubtasks,
    pendingComments,

    isPendingId: pending.isPendingId,
    addPendingSubtask: pending.addPendingSubtask,
    updatePendingSubtask: pending.updatePendingSubtask,
    removePendingSubtask: pending.removePendingSubtask,
    addPendingComment: pending.addPendingComment,
    updatePendingComment: pending.updatePendingComment,
    removePendingComment: pending.removePendingComment,
    open,
    openNew,
    patch,
    discard,
    commit,
    commitAndClose,
    clear,
  }
})
