import {onMounted, onUnmounted, ref} from "vue"

import {API} from "@/api"
import {useSettingsStore} from "@/stores/settings.store"

import type {Task} from "@daily/protocol"

/**
 * Loads the active project's deleted tasks for the Deleted Tasks section and
 * keeps the list current: reloads on mount and whenever data changes in any
 * window.
 */
export function useDeletedTasks() {
  const settingsStore = useSettingsStore()

  const deletedTasks = ref<Task[]>([])

  async function revalidate() {
    deletedTasks.value = await API.getDeletedTasks({branchId: settingsStore.settings?.branch?.activeId})
  }

  onMounted(() => {
    revalidate()
  })

  const unsubscribe = window.BridgeIPC.on("storage:changed", () => {
    revalidate()
  })

  onUnmounted(() => {
    unsubscribe()
  })

  return {
    deletedTasks,

    revalidate,
  }
}
