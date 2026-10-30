import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useSubtasksStore} from "@/stores/subtasks.store"
import {useTaskEditorStore} from "@/stores/task-editor"

import type {Subtask} from "@daily/protocol"

export const useTaskSubtasks = createSharedComposable(() => {
  const subtasksStore = useSubtasksStore()
  const taskEditorStore = useTaskEditorStore()
  const {editingTaskId, pendingSubtasks} = storeToRefs(taskEditorStore)

  const subtasks = computed<Subtask[]>(() => (editingTaskId.value ? subtasksStore.subtasksOf(editingTaskId.value) : pendingSubtasks.value))

  const count = computed(() => {
    if (editingTaskId.value) return subtasksStore.countOf(editingTaskId.value)
    if (!pendingSubtasks.value.length) return null
    return {done: pendingSubtasks.value.filter((item) => item.done).length, total: pendingSubtasks.value.length}
  })

  async function addSubtask(content: string, taskId: Subtask["taskId"] | null = editingTaskId.value): Promise<Subtask | null> {
    if (taskId) return subtasksStore.addSubtask(taskId, content)
    if (!taskEditorStore.addPendingSubtask(content)) return null
    return pendingSubtasks.value.at(-1) ?? null
  }

  async function updateSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) return taskEditorStore.updatePendingSubtask(id, updates)
    return subtasksStore.updateSubtask(id, updates)
  }

  async function removeSubtask(id: Subtask["id"]): Promise<boolean> {
    if (taskEditorStore.isPendingId(id)) return taskEditorStore.removePendingSubtask(id)
    return subtasksStore.removeSubtask(id)
  }

  watch(
    editingTaskId,
    (taskId) => {
      if (taskId) subtasksStore.loadSubtasks(taskId).catch(() => undefined)
    },
    {immediate: true},
  )

  return {
    subtasks,
    count,
    addSubtask,
    updateSubtask,
    removeSubtask,
    makeTask: subtasksStore.makeTask,
  }
})
