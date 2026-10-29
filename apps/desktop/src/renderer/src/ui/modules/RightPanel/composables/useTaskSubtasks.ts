import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {useSubtasksStore} from "@/stores/subtasks.store"
import {useTaskEditorStore} from "@/stores/task-editor"

import type {Subtask} from "@daily/protocol"

export const useTaskSubtasks = createSharedComposable(() => {
  const subtasksStore = useSubtasksStore()
  const {editingTaskId} = storeToRefs(useTaskEditorStore())

  const subtasks = computed<Subtask[]>(() => (editingTaskId.value ? subtasksStore.subtasksOf(editingTaskId.value) : []))

  const count = computed(() => (editingTaskId.value ? subtasksStore.countOf(editingTaskId.value) : null))

  async function addSubtask(content: string): Promise<boolean> {
    if (!editingTaskId.value) return false
    return subtasksStore.addSubtask(editingTaskId.value, content)
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
    updateSubtask: subtasksStore.updateSubtask,
    removeSubtask: subtasksStore.removeSubtask,
    makeTask: subtasksStore.makeTask,
  }
})
