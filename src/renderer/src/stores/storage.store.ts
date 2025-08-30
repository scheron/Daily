import {computed, ref} from "vue"
import {formatTimeAgo} from "@vueuse/core"
import {defineStore} from "pinia"

import {useTagsStore} from "./tags.store"
import {useTasksStore} from "./tasks.store"

export const useStorageStore = defineStore("storage", () => {
  const tasksStore = useTasksStore()
  const tagsStore = useTagsStore()

  const isSyncing = ref(false)
  const lastSyncTime = ref<Date | null>(null)

  const formattedTimeAgo = computed(() => {
    if (!lastSyncTime.value) return "Never"
    return formatTimeAgo(lastSyncTime.value)
  })

  function setIsSyncing(value: boolean) {
    isSyncing.value = value
  }

  function setLastSyncTime(value: Date) {
    lastSyncTime.value = value
  }

  async function revalidate(): Promise<void> {
    await Promise.all([tasksStore.revalidate(), tagsStore.revalidate()])
  }

  async function forceSyncStorage() {
    if (isSyncing.value) return false

    try {
      isSyncing.value = true
      const success = await window.electronAPI.syncStorage()

      if (success) {
        lastSyncTime.value = new Date()
      }

      return success
    } catch (error) {
      console.error("Failed to force sync:", error)
      return false
    } finally {
      isSyncing.value = false
    }
  }

  window.electronAPI.onStorageSync(async ({type}) => {
    lastSyncTime.value = new Date()

    if (type === "tasks") {
      await tasksStore.revalidate()
    } else if (type === "tags") {
      await tagsStore.revalidate()
    } else if (type === "settings") {
      console.electron("Storage sync: settings updated")
    }
  })

  window.electronAPI.onStorageSyncStatus(({isSyncing: syncing}) => {
    lastSyncTime.value = new Date()
    setIsSyncing(syncing)
  })

  return {
    isSyncing,
    lastSyncTime,

    formattedTimeAgo,
    forceSyncStorage,

    revalidate,

    setIsSyncing,
    setLastSyncTime,
  }
})
