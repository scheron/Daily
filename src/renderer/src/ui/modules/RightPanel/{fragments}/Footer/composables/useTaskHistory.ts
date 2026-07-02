import {computed, onScopeDispose, ref, toValue, watch} from "vue"

import {useStorageStore} from "@/stores/storage.store"

import {API} from "@/api"

import type {Task, TaskEvent} from "@shared/types/storage"
import type {MaybeRefOrGetter} from "vue"

/**
 * Loads and keeps fresh the full event history of a task.
 * @param task - The task (ref/getter) whose history to track; null clears the list.
 */
export function useTaskHistory(_task: MaybeRefOrGetter<Task | null>) {
  const storageStore = useStorageStore()

  const events = ref<TaskEvent[]>([])

  const task = computed(() => toValue(_task))
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

  const {off} = storageStore.onStorageDataChanged(revalidate)
  onScopeDispose(off)

  return {events, lastEvent, isEmpty}
}
