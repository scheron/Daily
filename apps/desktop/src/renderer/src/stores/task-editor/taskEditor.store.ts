import {computed, ref, watch} from "vue"
import {defineStore} from "pinia"

import {deepClone, isNull, notNull} from "@daily/std"

import {API} from "@/api"
import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import {useTasksStore} from "@/stores/tasks"
import {buildRestPatch} from "./utils/buildRestPatch"
import {sameIds} from "./utils/sameIds"
import {shallowEqualDraft} from "./utils/shallowEqualDraft"

import type {Branch, Milestone, Task, TaskRelationSets} from "@daily/protocol"
import type {TaskDraft} from "./types"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const tasksStore = useTasksStore()
  const taskRelationsStore = useTaskRelationsStore()

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
  const editingTaskUpdatedAt = computed(() => editingTask.value?.updatedAt ?? null)
  const editingTaskRelationIds = computed<TaskRelationSets | null>(() => {
    if (isNull(editingTaskId.value)) return null
    return relationIdsFor(editingTaskId.value)
  })

  async function open(taskId: Task["id"]) {
    const task = tasksStore.findTaskById(taskId) ?? (await API.getTask(taskId))
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
      branchId: params.branchId,
      scheduled: null,
      milestoneId: params.milestoneId,
      blockedBy: [],
      blocks: [],
    }
    draftBase.value = null
    editingTaskId.value = null
  }

  function patch(updates: Partial<TaskDraft>) {
    if (!draft.value) return
    const next = {...draft.value, ...updates}

    if (updates.status === "backlog") next.scheduled = null
    else if (updates.scheduled && draft.value.status === "backlog") next.status = "active"

    if (updates.branchId !== undefined && updates.branchId !== draft.value.branchId) {
      if (updates.blockedBy === undefined) next.blockedBy = []
      if (updates.blocks === undefined) next.blocks = []
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

    if (notNull(editingTaskId.value)) {
      const relationIds = relationIdsFor(editingTaskId.value)
      draft.value = {...restored, blockedBy: relationIds.blockedBy, blocks: relationIds.blocks}
      draftBase.value = {...base, blockedBy: [...relationIds.blockedBy], blocks: [...relationIds.blocks]}
    } else {
      draft.value = restored
    }
  }

  async function commit() {
    if (!draft.value) return
    const next = draft.value

    if (isNull(editingTaskId.value)) {
      const created = await tasksStore.createTask({
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        date: next.scheduled?.date,
        branchId: next.branchId ?? undefined,
        status: next.status,
        milestoneId: next.milestoneId,
      })

      if (created && (next.blockedBy.length || next.blocks.length)) {
        await taskRelationsStore.setTaskRelations(created.id, {blockedBy: next.blockedBy, blocks: next.blocks})
      }

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
      }

      if (!sameIds(next.blockedBy, base.blockedBy) || !sameIds(next.blocks, base.blocks)) {
        await taskRelationsStore.setTaskRelations(id, {blockedBy: next.blockedBy, blocks: next.blocks})
      }
    } else {
      await tasksStore.updateTask(id, {
        content: next.content,
        tags: next.tags,
        estimatedTime: next.estimatedTime,
        spentTime: next.spentTime,
        status: next.status,
        milestoneId: next.milestoneId,
      })
      await taskRelationsStore.setTaskRelations(id, {blockedBy: next.blockedBy, blocks: next.blocks})
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
    const relationIds = relationIdsFor(task.id)
    const next: TaskDraft = {
      content: task.content,
      tags: [...task.tags],
      estimatedTime: task.estimatedTime,
      spentTime: task.spentTime,
      status: task.status,
      branchId: task.branchId || null,
      scheduled: task.scheduled ? {...task.scheduled} : null,
      milestoneId: task.milestoneId,
      blockedBy: relationIds.blockedBy,
      blocks: relationIds.blocks,
    }
    draft.value = next
    draftBase.value = deepClone(next)
    editingTaskId.value = task.id
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

    open,
    openNew,
    patch,
    discard,
    commit,
    commitAndClose,
    clear,
  }
})
