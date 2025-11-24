import {onMounted, ref} from "vue"
import {toast} from "vue-sonner"
import {sleep} from "@shared/utils/common/sleep"
import {defineStore} from "pinia"

import type {ISODateTime} from "@shared/types/common"
import type {SyncStatus} from "@shared/types/storage"

import {useSettingsStore} from "./settings.store"
import {useTagsStore} from "./tags.store"
import {useTasksStore} from "./tasks.store"

export const useStorageStore = defineStore("storage", () => {
  const tasksStore = useTasksStore()
  const tagsStore = useTagsStore()
  const settingsStore = useSettingsStore()

  const status = ref<SyncStatus>("inactive")
  const lastSyncAt = ref<ISODateTime>(new Date().toISOString())

  async function loadSyncStatus(): Promise<void> {
    status.value = await window.BridgeIPC["storage-sync:get-status"]()
  }

  async function activateSync(): Promise<void> {
    try {
      await window.BridgeIPC["storage-sync:activate"]()
    } catch (error: any) {
      console.error("Failed to activate sync:", error)
    }
  }

  async function deactivateSync(): Promise<void> {
    try {
      await window.BridgeIPC["storage-sync:deactivate"]()
    } catch (error: any) {
      console.error("Failed to deactivate sync:", error)
    }
  }

  async function forceSync(): Promise<void> {
    try {
      await window.BridgeIPC["storage-sync:sync"]()
    } catch (error: any) {
      console.error("Failed to force sync:", error)
    }
  }

  async function revalidate(): Promise<void> {
    await Promise.all([tasksStore.revalidate(), tagsStore.revalidate(), settingsStore.revalidate()])
  }

  window.BridgeIPC["storage-sync:on-status-changed"](async (newStatus, prevStatus) => {
    status.value = newStatus
    lastSyncAt.value = new Date().toISOString()

    if (prevStatus === "inactive" && newStatus === "active") {
      await sleep(500)
      forceSync()
    }
  })

  window.BridgeIPC["storage-sync:on-data-changed"](async () => {
    lastSyncAt.value = new Date().toISOString()
    await revalidate()
    toast.success("Data synced successfully")
  })

  onMounted(async () => {
    await loadSyncStatus()
    if (status.value === "active") forceSync()
  })

  return {
    status,
    lastSyncAt,

    forceSync,
    activateSync,
    deactivateSync,

    revalidate,
  }
})
