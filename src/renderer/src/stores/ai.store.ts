import {computed, onUnmounted, ref} from "vue"
import {defineStore} from "pinia"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {toISODate} from "@shared/utils/date/formatters"
import {useLoadingState} from "@/composables/useLoadingState"

import type {AIMessage} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"

export const useAiStore = defineStore("ai", () => {
  const isConnected = ref(false)
  const {isLoaded, isError, isLoading, setState} = useLoadingState("IDLE")
  const {isLoaded: isThinkEnd, isLoading: isThinkingLoading, isError: isThinkError, setState: setThinkState} = useLoadingState("IDLE")

  const messages = ref<AIMessage[]>([])
  const availableModels = ref<string[]>([])
  const chatTimeStarted = ref<ISODate | null>(null)

  /**@deprecated удалить стриминг */
  const streamingContent = ref("")

  const hasMessages = computed(() => Boolean(messages.value.length))
  const lastMessage = computed(() => messages.value.at(-1) ?? null)

  async function checkConnection() {
    try {
      setState("LOADING")

      const isConnectedResult = await window.BridgeIPC["ai:check-connection"]()

      if (isConnectedResult) {
        availableModels.value = await window.BridgeIPC["ai:list-models"]()
      }

      isConnected.value = isConnectedResult
      setState("LOADED")
    } catch {
      setState("ERROR")
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (!content.trim() || isLoading.value || isThinkingLoading.value) return

    await withElapsedDelay(async () => {
      if (!hasMessages.value) {
        chatTimeStarted.value = toISODate(Date.now())
      }

      setThinkState("LOADING")

      const userMessage: AIMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      }

      messages.value.push(userMessage)

      try {
        const response = await window.BridgeIPC["ai:send-message"](content)

        if (response.success && response.message) {
          messages.value.push(response.message)
          setThinkState("LOADED")
        } else {
          setThinkState("ERROR")
        }
      } catch {
        setThinkState("ERROR")
      }
    })
  }

  async function retryMessage(): Promise<void> {
    if (!lastMessage.value) return
    await sendMessage(lastMessage.value.content)
    messages.value.splice(messages.value.length - 1, 1)
  }

  function cancelRequest(): void {
    window.BridgeIPC["ai:cancel"]()
    setThinkState("IDLE")
  }

  async function clearHistory(): Promise<void> {
    await window.BridgeIPC["ai:clear-history"]()
    chatTimeStarted.value = null
    messages.value = []
    setThinkState("IDLE")
  }

  const unsubscribe = window.BridgeIPC["ai:on-stream-chunk"]((chunk) => {
    streamingContent.value += chunk
  })

  onUnmounted(() => {
    unsubscribe()
  })

  return {
    messages,
    chatTimeStarted,
    isLoading,
    isLoaded,
    isError,

    isThinkingLoading,
    isThinkEnd,
    isThinkError,

    isConnected,
    availableModels,
    streamingContent,

    // Computed
    hasMessages,
    lastMessage,

    checkConnection,
    sendMessage,
    retryMessage,
    cancelRequest,
    clearHistory,
  }
})
