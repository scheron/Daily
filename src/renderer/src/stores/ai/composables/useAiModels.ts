import {computed} from "vue"

import {useLocalModelStore} from "@/stores/ai/localModel.store"
import {useRemoteModelStore} from "@/stores/ai/remoteModel.store"
import {useSettingsStore} from "@/stores/settings.store"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig, AIProvider, LocalModelId} from "@shared/types/ai"
import type {AiModelsContext} from "../types"

/**
 * Model catalog and provider connection: exposes the available/remote/local model lists
 * and runtime state, checks the provider connection, and forwards local-model lifecycle
 * actions (download, select, delete) to the local-model store.
 * @param ctx - AI config, disabled flag, connection loading-state, and connected flag
 */
export function useAiModels(ctx: AiModelsContext) {
  const {config, isDisabled, connectionState, isConnected} = ctx

  const settingsStore = useSettingsStore()
  const localModelStore = useLocalModelStore()
  const remoteModelStore = useRemoteModelStore()

  const remoteModels = computed(() => remoteModelStore.availableModels)
  const localModels = computed(() => localModelStore.models)
  const installedLocalModels = computed(() => localModelStore.installedModels)
  const localRuntimeState = computed(() => localModelStore.runtimeState)
  const localDiskUsage = computed(() => localModelStore.diskUsage)
  const availableModels = computed(() => {
    if (!config.value) return []
    if (config.value.provider === "openai") return remoteModelStore.availableModels
    if (config.value.provider === "local") return localModelStore.availableModels
    return []
  })

  async function updateConfig(updates: Partial<AIConfig>) {
    const success = await window.BridgeIPC["ai:update-config"](toRawDeep(updates))
    if (success) await settingsStore.revalidate()
  }

  async function checkConnection() {
    if (isDisabled.value) return
    try {
      connectionState.setState("LOADING")

      const isConnectedResult = await window.BridgeIPC["ai:check-connection"]()

      if (!isConnectedResult) {
        isConnected.value = false
        connectionState.setState("ERROR")
        return
      }

      const fetchedModels = await window.BridgeIPC["ai:list-models"]()
      isConnected.value = true
      connectionState.setState("LOADED")

      if (config.value?.provider === "openai") await remoteModelStore.setAvailableModels(fetchedModels)
      else if (config.value?.provider === "local") await localModelStore.setAvailableModels(fetchedModels)
    } catch {
      isConnected.value = false
      connectionState.setState("ERROR")
    }
  }

  async function selectModel(provider: AIProvider, model: string) {
    if (provider === "openai") await remoteModelStore.selectModel(model)
    else await localModelStore.selectModel(model as LocalModelId)

    await checkConnection()
  }

  function getLocalDownloadProgress(modelId: LocalModelId) {
    return localModelStore.getDownloadProgress(modelId)
  }

  function isLocalModelPending(modelId: LocalModelId) {
    return localModelStore.isPending(modelId)
  }

  function getLocalDownloadError(modelId: LocalModelId) {
    return localModelStore.getDownloadError(modelId)
  }

  function clearLocalDownloadError(modelId: LocalModelId) {
    localModelStore.clearDownloadError(modelId)
  }

  async function loadLocalModels() {
    await localModelStore.loadModels()
  }

  async function downloadLocalModel(modelId: LocalModelId) {
    await localModelStore.downloadModel(modelId)
  }

  async function cancelLocalModelDownload(modelId: LocalModelId) {
    await localModelStore.cancelDownload(modelId)
  }

  async function deleteLocalModel(modelId: LocalModelId) {
    await localModelStore.deleteModel(modelId)
    await checkConnection()
  }

  async function selectLocalModel(modelId: LocalModelId) {
    await localModelStore.selectModel(modelId)
    await checkConnection()
  }

  return {
    availableModels,
    remoteModels,
    localModels,
    installedLocalModels,
    localRuntimeState,
    localDiskUsage,

    isLocalModelsLoading: localModelStore.isLoadingModels,
    isLocalModelRunning: localModelStore.isModelRunning,
    isLocalModelStarting: localModelStore.isModelStarting,
    isLocalServerError: localModelStore.isServerError,

    updateConfig,
    checkConnection,
    selectModel,
    getLocalDownloadProgress,
    isLocalModelPending,
    getLocalDownloadError,
    clearLocalDownloadError,
    loadLocalModels,
    downloadLocalModel,
    cancelLocalModelDownload,
    deleteLocalModel,
    selectLocalModel,
  }
}
