import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {toISODate} from "@shared/utils/date/formatters"
import {useLocalModelStore} from "@/stores/ai/localModel.store"
import {useRemoteModelStore} from "@/stores/ai/remoteModel.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {toRawDeep} from "@/utils/ui/vue"

import type {AgentTurnSnapshot, AIConfig, AIMessage, AIProvider, LocalModelId, PendingToolConfirmation} from "@shared/types/ai"
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
  const pendingConfirmation = ref<PendingToolConfirmation | null>(null)

  // Hydrate the chat from the persisted active session (if any). Skips
  // when there's already in-memory chat (e.g. after live messages have
  // been sent). The promise is fire-and-forget — the chat view tolerates
  // late population.
  hydrateFromActiveSession()
  async function hydrateFromActiveSession() {
    if (messages.value.length > 0) return
    try {
      const {turns} = await window.BridgeIPC["ai:get-current-session"]()
      if (messages.value.length > 0) return
      if (!turns.length) return
      messages.value = turnsToMessages(turns)
      chatTimeStarted.value = toISODate(turns[0].startedAt)
    } catch {
      // Best-effort; chat starts empty.
    }
  }

  function turnsToMessages(turns: AgentTurnSnapshot[]): AIMessage[] {
    const out: AIMessage[] = []
    for (const turn of turns) {
      out.push({
        id: `user_${turn.id}`,
        role: "user",
        content: turn.userMessage,
        timestamp: turn.startedAt,
      })
      const finalText =
        turn.finalMessage ??
        (turn.status === "failed" ? `Error: ${turn.error ?? "unknown"}` : turn.status === "cancelled" ? "Request cancelled." : "")
      if (finalText) {
        out.push({
          id: `msg_${turn.id}`,
          role: "assistant",
          content: finalText,
          timestamp: turn.finishedAt ?? turn.startedAt,
          toolCalls: turn.toolCalls.length ? turn.toolCalls : [],
        })
      }
    }
    return out
  }

  // Install the confirmation listeners once per store instance. Pinia stores
  // are singletons per app, so this fires at most once.
  installConfirmationListeners()
  function installConfirmationListeners() {
    window.BridgeIPC["ai:on-confirmation-required"]((c) => {
      pendingConfirmation.value = c
    })
    window.BridgeIPC["ai:on-confirmation-resolved"](({confirmationId}) => {
      if (pendingConfirmation.value?.id === confirmationId) {
        pendingConfirmation.value = null
      }
    })
  }

  // Throttle delta flushes: LLM streaming can fire 100+ tokens/sec, each
  // mutation re-renders ChatMarkdown (O(N) markdown-it). Batching to ~20fps
  // keeps the UI responsive while still feeling live.
  const FLUSH_INTERVAL_MS = 50
  let contentBuffer = ""
  let reasoningBuffer = ""
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function flushStreamingBuffers() {
    flushTimer = null
    const live = messages.value.at(-1)
    if (!live || live.role !== "assistant" || !live.id.startsWith("live_")) {
      contentBuffer = ""
      reasoningBuffer = ""
      return
    }
    if (reasoningBuffer) {
      const segments = (live.segments = live.segments ?? [])
      const last = segments.at(-1)
      if (last?.kind === "reasoning") last.text += reasoningBuffer
      else segments.push({kind: "reasoning", text: reasoningBuffer, startedAt: Date.now()})
      reasoningBuffer = ""
    }
    if (contentBuffer) {
      live.content += contentBuffer
      contentBuffer = ""
    }
  }

  function finalizeLastReasoning(live: AIMessage) {
    const segments = live.segments ?? []
    const last = segments.at(-1)
    if (last?.kind === "reasoning" && last.durationMs === undefined && last.startedAt !== undefined) {
      last.durationMs = Date.now() - last.startedAt
    }
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(flushStreamingBuffers, FLUSH_INTERVAL_MS)
  }

  function cancelFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  installStreamingListeners()
  function installStreamingListeners() {
    window.BridgeIPC["ai:on-event"]((event) => {
      if (event.type === "turn_started") {
        cancelFlush()
        contentBuffer = ""
        reasoningBuffer = ""
        messages.value.push({
          id: `live_${event.turnId}`,
          role: "assistant",
          content: "",
          timestamp: event.startedAt,
          segments: [],
          status: "streaming",
        })
        return
      }

      const live = messages.value.at(-1)
      if (!live || live.role !== "assistant" || !live.id.startsWith(`live_${event.turnId}`)) return

      if (event.type === "model_reasoning_delta") {
        reasoningBuffer += event.text
        scheduleFlush()
        return
      }

      if (event.type === "model_content_delta") {
        // First content delta ends the reasoning phase. Flush any pending
        // reasoning text into its segment and stamp its durationMs.
        if (reasoningBuffer || (live.segments ?? []).at(-1)?.kind === "reasoning") {
          flushStreamingBuffers()
          finalizeLastReasoning(live)
        }
        contentBuffer += event.text
        scheduleFlush()
        return
      }

      if (event.type === "tool_started") {
        cancelFlush()
        flushStreamingBuffers()
        finalizeLastReasoning(live)
        live.segments = live.segments ?? []
        live.segments.push({
          kind: "tool",
          toolCallId: event.toolCallId,
          name: event.toolName,
          status: "running",
        })
        return
      }

      if (event.type === "tool_finished") {
        const segments = live.segments ?? []
        const tool = segments.find((s) => s.kind === "tool" && s.toolCallId === event.toolCallId)
        if (tool?.kind === "tool") {
          tool.status = "done"
          tool.success = event.success
          tool.summary = event.summary
        }
        return
      }

      if (event.type === "turn_finished") {
        cancelFlush()
        contentBuffer = ""
        reasoningBuffer = ""
        finalizeLastReasoning(live)
        live.content = event.finalMessage
        live.status = "complete"
        live.timestamp = event.finishedAt
        return
      }

      if (event.type === "turn_failed") {
        cancelFlush()
        flushStreamingBuffers()
        finalizeLastReasoning(live)
        live.status = "failed"
        live.error = event.error
        live.timestamp = event.finishedAt
        return
      }

      if (event.type === "turn_cancelled") {
        cancelFlush()
        flushStreamingBuffers()
        finalizeLastReasoning(live)
        live.status = "cancelled"
        live.timestamp = event.finishedAt
        return
      }
    })
  }

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

  function cancelRequest(): void {
    if (isDisabled.value) return

    isCancelled.value = true
    window.BridgeIPC["ai:cancel"]()
    thinkState.setState("IDLE")
    pendingConfirmation.value = null
  }

  async function clearHistory(): Promise<void> {
    if (isDisabled.value) return

    await window.BridgeIPC["ai:clear-history"]()

    chatTimeStarted.value = null
    messages.value = []
    pendingConfirmation.value = null
    thinkState.setState("IDLE")
  }

  async function confirmPendingToolCall(): Promise<void> {
    const id = pendingConfirmation.value?.id
    if (!id) return
    await window.BridgeIPC["ai:confirm-tool-call"](id)
    // The "resolved" broadcast clears the ref; clear locally too in case
    // the event hasn't arrived yet.
    pendingConfirmation.value = null
  }

  async function cancelPendingToolCall(): Promise<void> {
    const id = pendingConfirmation.value?.id
    if (!id) return
    await window.BridgeIPC["ai:cancel-tool-call"](id)
    pendingConfirmation.value = null
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
    pendingConfirmation,

    updateConfig,
    checkConnection,
    sendMessage,
    retryMessage,
    cancelRequest,
    clearHistory,
    confirmPendingToolCall,
    cancelPendingToolCall,
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
