import {computed, onScopeDispose, ref, watch} from "vue"
import {storeToRefs} from "pinia"

import {API} from "@/api"
import {useStorageChangesStore} from "@/stores/storageChanges.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"

import type {TaskEvent} from "@daily/protocol"

export function useTaskHistory() {
  const storageChangesStore = useStorageChangesStore()
  const tasksStore = useTasksStore()
  const {editingTaskId} = storeToRefs(useTaskEditorStore())

  const events = ref<TaskEvent[]>([])

  const task = computed(() => (editingTaskId.value ? tasksStore.findTaskById(editingTaskId.value) : null))
  const updatedAt = computed(() => task.value?.updatedAt ?? null)
  const signature = computed(() => (task.value ? `${task.value.id}:${updatedAt.value}` : null))

  const lastEvent = computed<TaskEvent | null>(() => events.value[0] ?? null)
  const isEmpty = computed(() => events.value.length === 0)

  async function revalidate(): Promise<void> {
    if (!task.value) {
      events.value = []
      return
    }
    events.value = await API.getTaskHistory(task.value.id)
  }

  watch(signature, revalidate, {immediate: true})

  const {off} = storageChangesStore.onStorageDataChanged(revalidate)
  onScopeDispose(off)

  return {task, events, lastEvent, isEmpty}
}
