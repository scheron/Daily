import {computed, ref} from "vue"
import {storeToRefs} from "pinia"

import {getTime, getTimezone, getToday} from "@daily/std"

import {useBranchesStore} from "@/stores/branches.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTasksStore} from "@/stores/tasks"

import type {TaskDraft} from "@/types/taskDraft"
import type {Task} from "@daily/protocol"

export function useQuickTaskDraft() {
  const {settings} = storeToRefs(useSettingsStore())
  const branchesStore = useBranchesStore()
  const tasksStore = useTasksStore()

  const projectPicked = ref(false)
  const isDateAuto = ref(false)
  const draft = ref<TaskDraft>(emptyDraft(settings.value?.branch?.activeId ?? null))

  const task = computed<Task>(() => ({
    id: "__quick_task__",
    branchId: draft.value.branchId ?? "",
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    scheduled: draft.value.scheduled,
    estimatedTime: draft.value.estimatedTime,
    spentTime: draft.value.spentTime,
    content: draft.value.content,
    minimized: false,
    orderIndex: 0,
    status: draft.value.status,
    tags: draft.value.tags,
    milestoneId: null,
  }))

  const isUntouched = computed(() => {
    const {content, tags, estimatedTime, status, scheduled} = draft.value
    return !content.trim() && !tags.length && !estimatedTime && status === "backlog" && !scheduled && !projectPicked.value
  })

  function patch(updates: Partial<TaskDraft>) {
    const next = {...draft.value, ...updates}

    if ("scheduled" in updates) isDateAuto.value = false

    if (updates.status === "backlog") next.scheduled = null
    else if (updates.status && !next.scheduled) {
      next.scheduled = todayScheduled()
      isDateAuto.value = true
    } else if (updates.status === undefined && "scheduled" in updates) {
      if (updates.scheduled === null) next.status = "backlog"
      else if (draft.value.status === "backlog") next.status = "active"
    }

    if (updates.branchId !== undefined) projectPicked.value = true

    if (updates.branchId !== undefined && updates.branchId !== draft.value.branchId) {
      if (updates.tags === undefined) next.tags = []
      if (updates.milestoneId === undefined) next.milestoneId = null
    }

    draft.value = next
  }

  function refresh() {
    tasksStore.setActiveDay(getToday())
    refreshAutoDate()

    if (isUntouched.value) draft.value = emptyDraft(settings.value?.branch?.activeId ?? null)
    else refreshProject()
  }

  async function save(): Promise<boolean> {
    if (!draft.value.content.trim().length) return false

    refreshAutoDate()
    refreshProject()

    const {content, tags, estimatedTime, status, branchId, scheduled} = draft.value
    const created = await tasksStore.createTask({
      content,
      tags,
      estimatedTime,
      date: scheduled?.date,
      branchId: branchId ?? undefined,
      status,
    })
    if (!created) return false

    projectPicked.value = false
    isDateAuto.value = false
    draft.value = emptyDraft(settings.value?.branch?.activeId ?? null)
    return true
  }

  function refreshAutoDate() {
    const {scheduled} = draft.value
    if (isDateAuto.value && scheduled && scheduled.date !== getToday()) draft.value = {...draft.value, scheduled: todayScheduled()}
  }

  function refreshProject() {
    const {branchId} = draft.value
    if (!branchesStore.branches.length || (branchId && branchesStore.branchesMap.has(branchId))) return

    draft.value = {...draft.value, branchId: settings.value?.branch?.activeId ?? null, tags: [], milestoneId: null}
    projectPicked.value = false
  }

  return {draft, task, patch, refresh, save}
}

function emptyDraft(branchId: TaskDraft["branchId"]): TaskDraft {
  return {
    content: "",
    tags: [],
    estimatedTime: 0,
    spentTime: 0,
    status: "backlog",
    branchId,
    scheduled: null,
    milestoneId: null,
    blockedBy: [],
    blocks: [],
  }
}

function todayScheduled(): NonNullable<TaskDraft["scheduled"]> {
  return {date: getToday(), time: getTime(), timezone: getTimezone()}
}
