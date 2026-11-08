import {onMounted, onUnmounted, ref} from "vue"

import {Storage} from "@/api"
import {useSettingsStore} from "@/stores/settings"

import type {Task} from "@daily/protocol"

export function useDeletedTasks() {
  const settingsStore = useSettingsStore()

  const deletedTasks = ref<Task[]>([])

  const unsubscribe = window.BridgeIPC.on("storage:changed", () => {
    revalidate()
  })

  async function revalidate() {
    deletedTasks.value = await Storage.getDeletedTasks({branchId: settingsStore.settings?.branch?.activeId})
  }

  onMounted(() => {
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
