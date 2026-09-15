import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"
import {updateAiConfig} from "./utils/updateAiConfig"

import type {AIConfig, LocalModelId} from "@daily/protocol"
import type {CatalogRefreshResult, LocalModelDownloadProgress, LocalModelInfo, LocalRuntimeState} from "@shared/types/ai"

export const useLocalModelStore = defineStore("localModel", () => {
  const settingsStore = useSettingsStore()

  const models = ref<LocalModelInfo[]>([])
  const runtimeState = ref<LocalRuntimeState>({status: "not_installed"})
  const downloadProgress = ref<Map<LocalModelId, LocalModelDownloadProgress>>(new Map())
  const downloadErrors = ref<Map<LocalModelId, string>>(new Map())
  const pendingDownloads = ref<Set<LocalModelId>>(new Set())
  const diskUsage = ref<{total: number; models: Record<string, number>}>({total: 0, models: {}})
  const isRefreshingCatalog = ref(false)

  const installedModels = computed(() => models.value.filter((m) => m.installed))
  const availableModels = computed(() => settingsStore.settings?.ai?.local?.availableModels ?? [])

  window.BridgeIPC["ai:on-local-state-changed"]((state) => {
    runtimeState.value = state
  })

  window.BridgeIPC["ai:on-local-download-progress"]((progress) => {
    pendingDownloads.value.delete(progress.modelId)
    pendingDownloads.value = new Set(pendingDownloads.value)

    downloadProgress.value.set(progress.modelId, progress)
    downloadProgress.value = new Map(downloadProgress.value)
  })

  window.BridgeIPC["ai:on-local-catalog-changed"](() => {
    loadModels()
  })

  function getDownloadProgress(modelId: LocalModelId): LocalModelDownloadProgress | null {
    return downloadProgress.value.get(modelId) ?? null
  }

  function isPending(modelId: LocalModelId): boolean {
    return pendingDownloads.value.has(modelId)
  }

  function getDownloadError(modelId: LocalModelId): string | null {
    return downloadErrors.value.get(modelId) ?? null
  }

  function clearDownloadError(modelId: LocalModelId) {
    downloadErrors.value.delete(modelId)
    downloadErrors.value = new Map(downloadErrors.value)
  }

  async function setAvailableModels(models: string[]) {
    await updateAiConfig({local: {availableModels: models} as AIConfig["local"]})
  }

  async function selectModel(model: LocalModelId) {
    await updateAiConfig({provider: "local", local: {model} as AIConfig["local"]})
  }

  async function loadModels() {
    models.value = await window.BridgeIPC["ai:local-list-models"]()
    diskUsage.value = await window.BridgeIPC["ai:local-get-disk-usage"]()
    runtimeState.value = await window.BridgeIPC["ai:local-get-state"]()
  }

  async function refreshCatalog(): Promise<CatalogRefreshResult> {
    isRefreshingCatalog.value = true
    try {
      const result = await window.BridgeIPC["ai:local-refresh-catalog"]()
      if (result === "updated") await loadModels()
      return result
    } finally {
      isRefreshingCatalog.value = false
    }
  }

  async function downloadModel(modelId: LocalModelId) {
    pendingDownloads.value.add(modelId)
    pendingDownloads.value = new Set(pendingDownloads.value)
    downloadErrors.value.delete(modelId)
    downloadErrors.value = new Map(downloadErrors.value)

    try {
      await window.BridgeIPC["ai:local-download-model"](modelId)
      downloadProgress.value.delete(modelId)
      downloadProgress.value = new Map(downloadProgress.value)
      await loadModels()
    } catch (err) {
      downloadErrors.value.set(modelId, err instanceof Error ? err.message : "Download failed")
      downloadErrors.value = new Map(downloadErrors.value)
    } finally {
      pendingDownloads.value.delete(modelId)
      pendingDownloads.value = new Set(pendingDownloads.value)
    }
  }

  async function cancelDownload(modelId: LocalModelId) {
    await window.BridgeIPC["ai:local-cancel-download"](modelId)
    downloadProgress.value.delete(modelId)
  }

  async function deleteModel(modelId: LocalModelId) {
    await window.BridgeIPC["ai:local-delete-model"](modelId)
    await loadModels()
  }

  return {
    models,
    runtimeState,
    diskUsage,
    isRefreshingCatalog,

    installedModels,
    availableModels,

    getDownloadProgress,
    isPending,
    getDownloadError,
    clearDownloadError,
    setAvailableModels,
    selectModel,
    loadModels,
    refreshCatalog,
    downloadModel,
    cancelDownload,
    deleteModel,
  }
})
