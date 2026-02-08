import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {toISODate} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig, AIMessage, AIProvider} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"

export const useAiStore = defineStore("ai", () => {
  const settingsStore = useSettingsStore()

  const connectionState = useLoadingState("IDLE")
  const thinkState = useLoadingState("IDLE")

  const isConnected = ref(false)
  const isCancelled = ref(false)
  const messages = ref<AIMessage[]>([])
  const chatTimeStarted = ref<ISODate | null>(null)

  const remoteModels = computed(() => config.value?.openai?.availableModels ?? [])
  const availableModels = computed(() => {
    if (!config.value) return []
    if (config.value.provider === "openai") return config.value.openai?.availableModels ?? []
    if (config.value.provider === "local") return config.value.local?.availableModels ?? []
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
    console.log("checkConnection", isDisabled.value)
    if (isDisabled.value) return
    try {
      console.log("checkConnection loading")
      connectionState.setState("LOADING")

      const isConnectedResult = await window.BridgeIPC["ai:check-connection"]()
      console.log("checkConnection isConnectedResult", isConnectedResult)

      if (!isConnectedResult) {
        isConnected.value = false
        connectionState.setState("ERROR")
        return
      }

      const fetchedModels = await window.BridgeIPC["ai:list-models"]()
      isConnected.value = true
      connectionState.setState("LOADED")

      // Persist fetched models into config
      if (config.value?.provider === "openai") {
        await updateConfig({openai: {availableModels: fetchedModels} as AIConfig["openai"]})
      } else if (config.value?.provider === "local") {
        await updateConfig({local: {availableModels: fetchedModels} as AIConfig["local"]})
      }
    } catch {
      console.log("checkConnection error")
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

    // Remove the failed user message before resending
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
    if (provider === "openai") {
      await updateConfig({provider, openai: {model} as AIConfig["openai"]})
    } else {
      await updateConfig({provider, local: {model} as unknown as AIConfig["local"]})
    }
    await checkConnection()
  }

  return {
    config,
    messages,
    chatTimeStarted,
    availableModels,
    remoteModels,

    isConnected,
    isDisabled,
    isConnectionLoading: connectionState.isLoading,
    isConnectionLoaded: connectionState.isLoaded,
    isConnectionError: connectionState.isError,
    isThinkLoading: thinkState.isLoading,
    isThinkLoaded: thinkState.isLoaded,
    isThinkError: thinkState.isError,

    hasMessages,
    lastMessage,

    updateConfig,
    checkConnection,
    sendMessage,
    retryMessage,
    cancelRequest,
    clearHistory,
    selectModel,
  }
})
