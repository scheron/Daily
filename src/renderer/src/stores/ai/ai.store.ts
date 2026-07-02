import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {LLM_MODELS} from "@shared/constants/ai"
import {toISODate} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import {useLoadingState} from "@/composables/useLoadingState"

import {useAiModels} from "./composables/useAiModels"
import {useAiSession} from "./composables/useAiSession"
import {useAiStreaming} from "./composables/useAiStreaming"
import {useToolConfirmations} from "./composables/useToolConfirmations"

import type {AIMessage} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"

export const useAiStore = defineStore("ai", () => {
  const settingsStore = useSettingsStore()

  const connectionState = useLoadingState("IDLE")
  const thinkState = useLoadingState("IDLE")

  const isConnected = ref(false)
  const isCancelled = ref(false)
  const messages = ref<AIMessage[]>([])
  const chatTimeStarted = ref<ISODate | null>(null)

  const config = computed(() => settingsStore.settings?.ai ?? null)
  const isDisabled = computed(() => !config.value?.enabled)
  const hasMessages = computed(() => Boolean(messages.value.length))
  const lastMessage = computed(() => messages.value.at(-1) ?? null)

  const contextUsage = computed(() => {
    let used = 0
    let total = 0
    for (const message of messages.value) {
      if (!message.usage) continue
      used = message.usage.promptTokens
      total += message.usage.totalTokens
    }
    const cfg = config.value
    const model = cfg?.provider === "local" ? cfg.local?.model : cfg?.openai?.model
    const window = model ? (LLM_MODELS[model]?.contextWindow ?? null) : null
    return {used, total, window}
  })

  const models = useAiModels({config, isDisabled, connectionState, isConnected})
  const confirmations = useToolConfirmations()
  useAiStreaming({messages})
  useAiSession({messages, chatTimeStarted})

  async function sendMessage(content: string): Promise<void> {
    if (isDisabled.value) return
    if (!content.trim() || connectionState.isLoading.value || thinkState.isLoading.value) return

    isCancelled.value = false

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
        const last = messages.value.at(-1)
        const liveAlreadyHandled = last?.id?.startsWith("live_") && (last?.status === "failed" || last?.status === "cancelled")
        if (!liveAlreadyHandled) {
          thinkState.setState("ERROR")
        } else {
          thinkState.setState("LOADED")
        }
        return
      }

      const last = messages.value.at(-1)
      const liveAlreadyPresent = last?.id?.startsWith("live_") && last?.role === "assistant"
      if (!liveAlreadyPresent) {
        messages.value.push(response.message)
      }
      toasts.success("AI response ready")
      thinkState.setState("LOADED")
    } catch {
      if (isCancelled.value) return
      const last = messages.value.at(-1)
      const liveAlreadyFailed = last?.id?.startsWith("live_") && last?.status === "failed"
      if (!liveAlreadyFailed) {
        thinkState.setState("ERROR")
      } else {
        thinkState.setState("LOADED")
      }
    }
  }

  async function retryMessage(): Promise<void> {
    const lastUserMessage = [...messages.value].reverse().find((m) => m.role === "user")
    if (!lastUserMessage) return

    const lastUserIdx = messages.value.lastIndexOf(lastUserMessage)
    if (lastUserIdx !== -1) messages.value.splice(lastUserIdx, 1)

    thinkState.setState("IDLE")
    await sendMessage(lastUserMessage.content)
  }

  function cancelRequest() {
    if (isDisabled.value) return

    isCancelled.value = true
    window.BridgeIPC["ai:cancel"]()
    thinkState.setState("IDLE")
    confirmations.resetConfirmation()
  }

  async function clearHistory(): Promise<void> {
    if (isDisabled.value) return

    await window.BridgeIPC["ai:clear-history"]()

    chatTimeStarted.value = null
    messages.value = []
    confirmations.resetConfirmation()
    thinkState.setState("IDLE")
  }

  return {
    config,
    messages,
    chatTimeStarted,

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
    contextUsage,

    pendingConfirmation: confirmations.pendingConfirmation,
    confirmPendingToolCall: confirmations.confirmPendingToolCall,
    cancelPendingToolCall: confirmations.cancelPendingToolCall,

    sendMessage,
    retryMessage,
    cancelRequest,
    clearHistory,

    ...models,
  }
})
