import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig, LocalModelDownloadProgress, LocalModelId, LocalModelInfo, LocalRuntimeState} from "@shared/types/ai"

export const useLocalModelStore = defineStore("localModel", () => {
  const settingsStore = useSettingsStore()

  const models = ref<LocalModelInfo[]>([])
  const runtimeState = ref<LocalRuntimeState>({status: "not_installed"})
  const downloadProgress = ref<Map<LocalModelId, LocalModelDownloadProgress>>(new Map())
  const downloadErrors = ref<Map<LocalModelId, string>>(new Map())
  const pendingDownloads = ref<Set<LocalModelId>>(new Set())
  const diskUsage = ref<{total: number; models: Record<string, number>}>({total: 0, models: {}})
  const isLoadingModels = ref(false)

  const installedModels = computed(() => models.value.filter((m) => m.installed))
  const isModelRunning = computed(() => runtimeState.value.status === "running")
  const isModelStarting = computed(() => runtimeState.value.status === "starting")
  const isServerError = computed(() => runtimeState.value.status === "error")
  const availableModels = computed(() => settingsStore.settings?.ai?.local?.availableModels ?? [])
  const selectedModel = computed(() => settingsStore.settings?.ai?.local?.model ?? null)
  const activeModelId = computed(() => {
    const state = runtimeState.value
    if ("modelId" in state) return state.modelId
    return null
  })

  function getDownloadProgress(modelId: LocalModelId): LocalModelDownloadProgress | null {
    return downloadProgress.value.get(modelId) ?? null
  }

  function isDownloading(modelId: LocalModelId): boolean {
    return downloadProgress.value.has(modelId)
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

  async function updateConfig(updates: Partial<AIConfig>) {
    const success = await window.BridgeIPC["ai:update-config"](toRawDeep(updates))
    if (success) await settingsStore.revalidate()
  }

  async function setAvailableModels(models: string[]) {
    await updateConfig({local: {availableModels: models} as AIConfig["local"]})
  }

  async function selectModel(model: LocalModelId) {
    await updateConfig({provider: "local", local: {model} as AIConfig["local"]})
  }

  async function loadModels() {
    isLoadingModels.value = true
    try {
      models.value = await window.BridgeIPC["ai:local-list-models"]()
      diskUsage.value = await window.BridgeIPC["ai:local-get-disk-usage"]()
      runtimeState.value = await window.BridgeIPC["ai:local-get-state"]()
    } finally {
      isLoadingModels.value = false
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

  window.BridgeIPC["ai:on-local-state-changed"]((state) => {
    runtimeState.value = state
  })

  window.BridgeIPC["ai:on-local-download-progress"]((progress) => {
    pendingDownloads.value.delete(progress.modelId)
    pendingDownloads.value = new Set(pendingDownloads.value)

    downloadProgress.value.set(progress.modelId, progress)
    downloadProgress.value = new Map(downloadProgress.value)
  })

  return {
    models,
    runtimeState,
    downloadProgress,
    downloadErrors,
    pendingDownloads,
    diskUsage,
    isLoadingModels,

    installedModels,
    isModelRunning,
    isModelStarting,
    isServerError,
    availableModels,
    selectedModel,
    activeModelId,

    getDownloadProgress,
    isDownloading,
    isPending,
    getDownloadError,
    clearDownloadError,
    setAvailableModels,
    selectModel,
    loadModels,
    downloadModel,
    cancelDownload,
    deleteModel,
  }
})
