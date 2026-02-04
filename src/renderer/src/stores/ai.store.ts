import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {toISODate} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig, AIMessage} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"

export const useAiStore = defineStore("ai", () => {
  const settingsStore = useSettingsStore()

  const connectionState = useLoadingState("IDLE")
  const thinkState = useLoadingState("IDLE")

  const isConnected = ref(false)
  const messages = ref<AIMessage[]>([])
  const availableModels = ref<string[]>([])
  const chatTimeStarted = ref<ISODate | null>(null)

  const config = computed(() => settingsStore.settings?.ai ?? null)

  const isDisabled = computed(() => !config.value?.enabled)
  const hasMessages = computed(() => Boolean(messages.value.length))
  const lastMessage = computed(() => messages.value.at(-1) ?? null)

  async function updateConfig(updates: Partial<AIConfig>) {
    const success = await window.BridgeIPC["ai:update-config"](toRawDeep(updates))
    if (success) settingsStore.revalidate()
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

      availableModels.value = await window.BridgeIPC["ai:list-models"]()
      isConnected.value = true
      connectionState.setState("LOADED")
    } catch {
      isConnected.value = false
      connectionState.setState("ERROR")
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (isDisabled.value) return
    if (!content.trim() || connectionState.isLoading.value || thinkState.isLoading.value) return

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

        if (!response.success || !response.message) {
          thinkState.setState("ERROR")
          return
        }

        messages.value.push(response.message)
        thinkState.setState("LOADED")
      } catch {
        thinkState.setState("ERROR")
      }
    })
  }

  async function retryMessage(): Promise<void> {
    if (!lastMessage.value) return
    await sendMessage(lastMessage.value.content)
  }

  function cancelRequest(): void {
    if (isDisabled.value) return
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

  return {
    config,
    messages,
    chatTimeStarted,
    availableModels,

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
  }
})
