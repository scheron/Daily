import {computed, onMounted, ref, watch} from "vue"
import {defineStore} from "pinia"

import {resolveActiveProvider} from "@daily/protocol"
import {sleep} from "@daily/std"

import {useSettingsStore} from "../settings"
import {useStorageChangesStore} from "../storage-changes"

import type {ISODateTime, MigrationDirection, MigrationPreview, SyncProvider, SyncStatus} from "@daily/protocol"

export const useStorageStore = defineStore("storage", () => {
  const settingsStore = useSettingsStore()
  const storageChangesStore = useStorageChangesStore()

  const status = ref<SyncStatus>("inactive")
  const lastSyncAt = ref<ISODateTime>(new Date().toISOString())
  const serverSyncError = ref<string | null>(null)

  const provider = computed<SyncProvider>(() => {
    const sync = settingsStore.settings?.sync
    return sync ? resolveActiveProvider(sync) : "off"
  })

  window.BridgeIPC["storage-sync:on-status-changed"](async (newStatus, prevStatus) => {
    status.value = newStatus
    lastSyncAt.value = new Date().toISOString()

    if (prevStatus === "inactive" && newStatus === "active") {
      await sleep(500)
      await forceSync()
    }
  })

  storageChangesStore.onStorageDataChanged(async () => {
    lastSyncAt.value = new Date().toISOString()
    await revalidate()
  })

  window.BridgeIPC["settings:on-changed"](() => settingsStore.revalidate())

  async function previewMigration(target: Exclude<SyncProvider, "off">): Promise<MigrationPreview> {
    return window.BridgeIPC["sync-provider:preview"](target)
  }

  async function migrateProvider(target: SyncProvider, direction: MigrationDirection | null): Promise<void> {
    await window.BridgeIPC["sync-provider:migrate"](target, direction)
  }

  async function loadSyncStatus(): Promise<void> {
    status.value = await window.BridgeIPC["storage-sync:get-status"]()
  }

  async function forceSync(): Promise<void> {
    try {
      await window.BridgeIPC["storage-sync:sync"]()
    } catch (error: any) {
      console.error("Failed to force sync:", error)
    }
  }

  async function revalidate(): Promise<void> {
    await settingsStore.revalidate()
  }

  async function loadServerSyncError(): Promise<void> {
    const states = await window.BridgeIPC["storage-sync:get-remote-states"]()
    serverSyncError.value = states.find((state) => state.id === "daily-server")?.lastError ?? null
  }

  watch(status, (value) => {
    if (value === "error") loadServerSyncError()
  })

  onMounted(async () => {
    await loadSyncStatus()
    if (status.value === "active") forceSync()
  })

  return {
    status,
    lastSyncAt,
    serverSyncError,
    provider,

    forceSync,
    previewMigration,
    migrateProvider,
  }
})
