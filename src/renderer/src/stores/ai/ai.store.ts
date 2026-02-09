import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {toISODate} from "@shared/utils/date/formatters"
import {useLocalModelStore} from "@/stores/ai/localModel.store"
import {useRemoteModelStore} from "@/stores/ai/remoteModel.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig, AIMessage, AIProvider, LocalModelId} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"

export const useAiStore = defineStore("ai", () => {
  const settingsStore = useSettingsStore()
  const localModelStore = useLocalModelStore()
  const remoteModelStore = useRemoteModelStore()

  const connectionState = useLoadingState("IDLE")
  const thinkState = useLoadingState("IDLE")

  const isConnected = ref(false)
  const isCancelled = ref(false)
  const messages = ref<AIMessage[]>([])
  const chatTimeStarted = ref<ISODate | null>(null)

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

  const config = computed(() => settingsStore.settings?.ai ?? null)

  const isDisabled = computed(() => !config.value?.enabled)
  const hasMessages = computed(() => Boolean(messages.value.length))
  const lastMessage = computed(() => messages.value.at(-1) ?? null)

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

  async function sendMessage(content: string): Promise<void> {
    if (isDisabled.value) return
    if (!content.trim() || connectionState.isLoading.value || thinkState.isLoading.value) return

    isCancelled.value = false

    await withElapsedDelay(async () => {
      if (!hasMessages.value) chatTimeStarted.value = toISODate(Date.now())

      thinkState.setState("LOADING")

      const userMessage: AIMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      }

      messages.value.push(userMessage)

      try {
        const response = await window.BridgeIPC["ai:send-message"](content)

        if (isCancelled.value) return

        if (!response.success || !response.message) {
          thinkState.setState("ERROR")
          return
        }

        messages.value.push(response.message)
        toasts.success("AI response ready")
        thinkState.setState("LOADED")
      } catch {
        if (isCancelled.value) return
        thinkState.setState("ERROR")
      }
    })
  }

  async function retryMessage(): Promise<void> {
    const lastUserMessage = [...messages.value].reverse().find((m) => m.role === "user")
    if (!lastUserMessage) return

    const lastUserIdx = messages.value.lastIndexOf(lastUserMessage)
    if (lastUserIdx !== -1) messages.value.splice(lastUserIdx, 1)

    thinkState.setState("IDLE")
    await sendMessage(lastUserMessage.content)
  }

  function cancelRequest(): void {
    if (isDisabled.value) return

    isCancelled.value = true
    window.BridgeIPC["ai:cancel"]()
    thinkState.setState("IDLE")
  }

  async function clearHistory(): Promise<void> {
    if (isDisabled.value) return

    await window.BridgeIPC["ai:clear-history"]()

    chatTimeStarted.value = null
    messages.value = []
    thinkState.setState("IDLE")
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
    config,
    messages,
    chatTimeStarted,
    availableModels,
    remoteModels,
    localModels,
    installedLocalModels,
    localRuntimeState,
    localDiskUsage,

    isConnected,
    isDisabled,
    isConnectionLoading: connectionState.isLoading,
    isConnectionLoaded: connectionState.isLoaded,
    isConnectionError: connectionState.isError,
    isThinkLoading: thinkState.isLoading,
    isThinkLoaded: thinkState.isLoaded,
    isThinkError: thinkState.isError,
    isLocalModelsLoading: localModelStore.isLoadingModels,
    isLocalModelRunning: localModelStore.isModelRunning,
    isLocalModelStarting: localModelStore.isModelStarting,
    isLocalServerError: localModelStore.isServerError,

    hasMessages,
    lastMessage,

    updateConfig,
    checkConnection,
    sendMessage,
    retryMessage,
    cancelRequest,
    clearHistory,
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
})
