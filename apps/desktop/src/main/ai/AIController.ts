import {nanoid} from "nanoid"

import {logger} from "@daily/core"
import {AsyncMutex, deepMerge, isArray, isBoolean, isNull, isNullish, isNumber, isObject, isString, LRU, notNull, notUndefined} from "@daily/std"

import {UNLOAD_MODEL_TIME} from "@shared/constants/ai"
import {NonRetryableError} from "@shared/errors/ai/NonRetryableError"
import {filterThinkBlocks} from "./utils/filterThinkBlocks"
import {redactAiMessagesForLog} from "./utils/logs/redactAiMessagesForLog"
import {redactToolParamsForLog} from "./utils/logs/redactToolParamsForLog"
import {computeWebReadBudget} from "./web/utils/computeWebReadBudget"
import {LocalAiClient} from "./clients/local"
import {RemoteAiClient} from "./clients/remote"
import {HookChain} from "./hooks/HookChain"
import {ConversationCompactor} from "./memory/ConversationCompactor"
import {restoreConversationHistory} from "./memory/restoreConversationHistory"
import {describeToolCall} from "./policy/describeToolCall"
import {createPolicyHook} from "./policy/policyHook"
import {DEFAULT_CONFIRMATION_TIMEOUT_MS} from "./policy/types"
import {getSystemPrompt} from "./promts/getSystemPrompt"
import {getWebAccessPrompt} from "./promts/getWebAccessPrompt"
import {parseCompatToolCalls, toolsToCompatPrompt} from "./tools/compat"
import {toModelImageMessage, toModelToolMessage, toPersistableToolResult, toRendererToolCall} from "./tools/format"
import {AI_TOOLS} from "./tools/registry"
import {toolEventLabel} from "./tools/toolEventLabel"
import {ToolExecutor} from "./tools/ToolExecutor"
import {TurnBuilder} from "./turns/TurnBuilder"
import {turnToSnapshot} from "./turns/turnToSnapshot"
import {WEB_LIMITS} from "./web/constants"

import type {StorageController} from "@daily/core"
import type {AIConfig, UnloadModelTime} from "@daily/protocol"
import type {AgentTurnSnapshot, AIEvent, AIMessage, AIResponse, LocalRuntimeState, PendingToolConfirmation, TokenUsage} from "@shared/types/ai"
import type {ILocalModelService} from "./clients/local"
import type {AgentContext} from "./hooks/types"
import type {PendingConfirmation} from "./policy/types"
import type {ToolName} from "./tools/registry"
import type {ToolResult} from "./tools/types"
import type {ChatStreamCallbacks, IAiClient, MessageLLM, Tool, ToolCallLLM, ToolChoice} from "./types"
import type {CachedPage} from "./web/types"

/**
 * Event emitted to the renderer when a destructive tool call needs user
 * confirmation, or when a previously-pending confirmation is resolved.
 * The renderer subscribes via the `ai:on-confirmation-required` /
 * `ai:on-confirmation-resolved` IPC channels.
 */
type ConfirmationBroadcastEvent = {type: "required"; confirmation: PendingToolConfirmation} | {type: "resolved"; confirmationId: string}

type AIControllerDeps = {
  remoteClient?: RemoteAiClient
  localClient?: LocalAiClient
  executor?: ToolExecutor
}

export class AIController {
  private openaiClient: RemoteAiClient
  private localClient: LocalAiClient
  private executor: ToolExecutor
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig | null = null
  private currentToolSchemas = new Map<string, Tool["function"]["parameters"]>()
  private currentWebAccess: AIConfig["webAccess"] = null
  private currentWebReadBudget: ReturnType<typeof computeWebReadBudget> | null = null
  private pageCache = new LRU<string, CachedPage>(WEB_LIMITS.pageCacheEntries, WEB_LIMITS.pageCacheTtlMs)
  private sendMutex = new AsyncMutex()
  private hooks = new HookChain()
  private pendingConfirmation: PendingConfirmation | null = null
  private compactor = new ConversationCompactor()
  private lastActivityAt = Date.now()
  private idleTimer: ReturnType<typeof setInterval> | null = null

  /** Name-based heuristic for detecting remote reasoning/thinking models. Extend as new families ship. */
  private readonly REASONING_MODEL_PATTERNS: RegExp[] = [/reasoner/, /deepseek-r\d/, /deepseek-v[4-9]/, /thinking/, /qwq/, /^o[1-9]/]

  constructor(
    private storage: StorageController,
    broadcastState?: (state: LocalRuntimeState) => void,
    private broadcastConfirmation?: (event: ConfirmationBroadcastEvent) => void,
    private broadcastEvent?: (event: AIEvent) => void,
    deps: AIControllerDeps = {},
  ) {
    this.executor = deps.executor ?? new ToolExecutor(storage)
    this.openaiClient = deps.remoteClient ?? new RemoteAiClient()
    this.localClient = deps.localClient ?? new LocalAiClient(broadcastState)
  }

  async init() {
    const config = (await this.storage.loadSettings()).ai
    await this.localClient.modelService.init()
    await this.updateConfig(config)
    this.hooks.registerBeforeToolCall(createPolicyHook(this))
    this.hooks.registerTransformContext(this.compactor.makeHook({threshold: 30, keepLastMessages: 16}))
    try {
      const turns = await this.storage.getActiveAiSessionTurns(50)
      this.compactor.refresh(turns)
      this.conversationHistory = restoreConversationHistory(turns)
      logger.info(logger.CONTEXT.AI, "Restored conversation history from active session", {
        turnsCount: turns.length,
        messagesCount: this.conversationHistory.length,
      })
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "Conversation history restore failed", err)
    }
    this.idleTimer = setInterval(() => {
      this.checkIdle().catch((err) => logger.error(logger.CONTEXT.AI, "Idle check failed", err))
    }, 60_000)
    this.idleTimer.unref?.()
  }

  async updateConfig(config: AIConfig | null) {
    if (config?.enabled) config.provider = config?.provider ?? "openai"

    const previousProvider = this.config?.provider

    this.config = deepMerge(this.config, config)

    await this.storage.saveSettings({ai: this.config!})

    this.openaiClient.updateConfig(this.config)
    this.localClient.updateConfig(this.config)

    if (previousProvider === "local" && this.config?.provider !== "local") {
      await this.localClient.dispose()
    }

    return true
  }

  async checkConnection(): Promise<boolean> {
    this.lastActivityAt = Date.now()
    return this.activeProvider.checkConnection()
  }

  async listModels(): Promise<string[]> {
    return this.activeProvider.listModels()
  }

  getLocalModel(): ILocalModelService {
    return this.localClient.modelService
  }

  async deleteLocalModel(modelId: string): Promise<boolean> {
    const server = (this.localClient as any).server
    const currentModelId = server?.getCurrentModelId?.()

    if (currentModelId === modelId) {
      await server.stop()
    }

    const ok = await this.localClient.modelService.deleteModel(modelId)

    if (this.config?.local?.model === modelId) {
      const newAi = {...(this.config ?? {}), local: {...(this.config?.local ?? {}), model: null}}
      this.config = newAi as unknown as typeof this.config
      await this.storage.saveSettings({ai: newAi as any})
      this.localClient.updateConfig(this.config)
      this.openaiClient.updateConfig(this.config)
    }

    return ok
  }

  getToolExecutor(): ToolExecutor {
    return this.executor
  }

  getHooks(): HookChain {
    return this.hooks
  }

  async getLocalState(): Promise<LocalRuntimeState> {
    const serverState = this.localClient.getState()

    if (serverState.status === "not_installed") {
      const selectedModel = this.config?.local?.model

      if (selectedModel && (await this.localClient.modelService.isInstalled(selectedModel))) {
        return {status: "installed", modelId: selectedModel}
      }
    }

    return serverState
  }

  async dispose(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
    this.resolvePendingConfirmation(false)
    await this.localClient.dispose()
  }

  /**
   * Returns the persisted turns of the currently-active session as renderer-
   * friendly snapshots. Empty when there is no active session.
   */
  async getCurrentSession(): Promise<{turns: AgentTurnSnapshot[]}> {
    const turns = await this.storage.getActiveAiSessionTurns(20)
    return {turns: turns.map(turnToSnapshot)}
  }

  async clearHistory(): Promise<boolean> {
    this.resolvePendingConfirmation(false)
    try {
      await this.storage.archiveActiveAiSession()
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "Failed to archive AI session on clearHistory", err)
    }
    this.conversationHistory = []
    return true
  }

  cancel(): boolean {
    this.resolvePendingConfirmation(false)
    this.abortController?.abort()
    return true
  }

  confirmToolCall(confirmationId: string): boolean {
    return this.resolvePendingConfirmation(true, confirmationId)
  }

  cancelToolCall(confirmationId: string): boolean {
    return this.resolvePendingConfirmation(false, confirmationId)
  }

  /** PolicyHookHost: whether external-egress tools may run without user confirmation. */
  isEgressAutoApproved(): boolean {
    return this.currentWebAccess?.autoApprove === true
  }

  /** PolicyHookHost: the page cache so cache-hit reads skip confirmation. */
  getWebPageCache(): LRU<string, CachedPage> {
    return this.pageCache
  }

  /**
   * Called from the policy hook. Returns when the user confirms, cancels,
   * or the timer fires. Resolves to `true` on confirm, `false` otherwise.
   */
  async awaitConfirmation(toolName: string, params: unknown): Promise<boolean> {
    this.resolvePendingConfirmation(false)

    const description = await describeToolCall(toolName, params, this.storage)
    const id = nanoid()
    const createdAt = Date.now()

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.resolvePendingConfirmation(false, id)
      }, DEFAULT_CONFIRMATION_TIMEOUT_MS)

      this.pendingConfirmation = {
        id,
        toolName,
        params,
        title: description.title,
        summary: description.summary,
        details: description.details,
        createdAt,
        resolve,
        timeoutId,
      }

      const payload: PendingToolConfirmation = {
        id,
        toolName,
        title: description.title,
        summary: description.summary,
        details: description.details,
        createdAt,
      }

      try {
        this.broadcastConfirmation?.({type: "required", confirmation: payload})
      } catch (err) {
        logger.warn(logger.CONTEXT.AI, "broadcastConfirmation failed", err)
      }
    })
  }

  async sendMessage(userMessage: string): Promise<AIResponse> {
    if (!this.executor) return {success: false, error: "Storage not initialized"}

    this.lastActivityAt = Date.now()

    const release = this.sendMutex.tryLock()
    if (!release) {
      return {success: false, error: "AI assistant is already processing a message"}
    }

    const config = (await this.storage.loadSettings()).ai
    if (!config?.enabled) {
      release()
      return {success: false, error: "AI assistant is disabled"}
    }

    logger.info(logger.CONTEXT.AI, "Processing message", {
      messageLength: userMessage.length,
      provider: config.provider,
      userText: userMessage.length > 400 ? `${userMessage.slice(0, 400)}…` : userMessage,
    })

    const historyStartIndex = this.conversationHistory.length
    this.abortController = new AbortController()

    const ctx: AgentContext = {
      turnId: nanoid(),
      userMessage,
      startedAt: Date.now(),
      messages: this.conversationHistory,
    }

    const turn = new TurnBuilder(userMessage)
    this.emit({type: "turn_started", turnId: turn.id, userMessage, startedAt: Date.now()})

    try {
      this.conversationHistory.push({role: "user", content: userMessage})

      const toolCalls: Array<{name: string; result: string}> = []
      let finalContent = ""

      let iterations = 0
      const maxIterations = 10
      const compatMode = this.isCompatMode(config)
      this.currentWebAccess = config.webAccess
      this.currentWebReadBudget = computeWebReadBudget(this.resolveContextTokens(config))
      const toolChoice = compatMode ? undefined : this.resolveToolChoice(config)
      const baseSystemPromptWithWeb = `${getSystemPrompt()}\n\n${getWebAccessPrompt()}`
      const tools = AI_TOOLS
      this.currentToolSchemas = new Map(tools.map((tool) => [tool.function.name, tool.function.parameters]))
      const systemPrompt = compatMode ? `${baseSystemPromptWithWeb}\n\n${toolsToCompatPrompt(tools)}` : baseSystemPromptWithWeb
      logger.info(logger.CONTEXT.AI, "Agent loop config", {
        toolChoice,
        compatMode,
        provider: config.provider,
        model: config.openai?.model ?? config.local?.model,
        systemPromptLength: systemPrompt.length,
      })

      while (iterations < maxIterations) {
        iterations++

        const baseMessages: MessageLLM[] = [{role: "system", content: systemPrompt}, ...this.conversationHistory]

        const messages = [...this.hooks.runTransformContext(baseMessages)]

        logger.info(logger.CONTEXT.AI, `Agent loop iteration ${iterations}/${maxIterations}`, {
          turnId: turn.id,
          messagesCount: messages.length,
        })
        logger.debug(logger.CONTEXT.AI, "Prepared LLM messages", {
          iteration: iterations,
          systemPromptLength: systemPrompt.length,
          ...redactAiMessagesForLog(messages),
        })

        this.emit({type: "model_requested", turnId: turn.id, iteration: iterations})

        const iterReasoning: string[] = []
        let reasoningStartedAt: number | null = null
        let reasoningEndedAt: number | null = null

        const response = await this.callLLM(messages, toolChoice, compatMode, {
          onDelta: (d) => {
            const now = Date.now()
            if (d.kind === "reasoning") {
              if (compatMode) return
              if (isNull(reasoningStartedAt)) reasoningStartedAt = now
              iterReasoning.push(d.text)
              this.emit({type: "model_reasoning_delta", turnId: turn.id, iteration: iterations, text: d.text})
            } else {
              if (notNull(reasoningStartedAt) && isNull(reasoningEndedAt)) {
                reasoningEndedAt = now
              }
              this.emit({type: "model_content_delta", turnId: turn.id, iteration: iterations, text: d.text})
            }
          },
        })

        if (notNull(reasoningStartedAt) && isNull(reasoningEndedAt)) {
          reasoningEndedAt = Date.now()
        }

        const iterationReasoning = iterReasoning.join("") || undefined
        const iterationReasoningDurationMs =
          notNull(reasoningStartedAt) && notNull(reasoningEndedAt) ? reasoningEndedAt - reasoningStartedAt : undefined

        let assistantMessage = response.message
        if (response.usage) turn.recordUsage(response.usage)

        if (compatMode) {
          const {toolCalls: parsedCalls, remainingContent} = parseCompatToolCalls(this.assistantTextOf(assistantMessage) || null)
          if (parsedCalls.length > 0) {
            assistantMessage = {
              ...assistantMessage,
              content: remainingContent || null,
              tool_calls: parsedCalls,
            }
            logger.info(logger.CONTEXT.AI, "Compat-mode tool calls parsed from content", {
              iteration: iterations,
              count: parsedCalls.length,
              names: parsedCalls.map((tc) => tc.function.name),
            })
          }
        }

        turn.appendStep({
          type: "model_response",
          message: assistantMessage,
          reasoning: iterationReasoning,
          reasoningDurationMs: iterationReasoningDurationMs,
        })
        this.emit({
          type: "model_responded",
          turnId: turn.id,
          iteration: iterations,
          hasToolCalls: Boolean(assistantMessage.tool_calls?.length),
        })

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
          const messageForHistory: MessageLLM = {...assistantMessage}
          delete messageForHistory.reasoning_content
          this.conversationHistory.push(messageForHistory)
          logger.info(logger.CONTEXT.AI, "LLM requested tool calls", {
            iteration: iterations,
            count: assistantMessage.tool_calls.length,
            names: assistantMessage.tool_calls.map((tc) => tc.function.name),
          })

          let respondTextForTurn: string | null = null
          const imageMessagesForRound: MessageLLM[] = []

          for (const toolCall of assistantMessage.tool_calls) {
            if (toolCall.function.name === "respond") {
              const args = toolCall.function.arguments
              const params = typeof args === "object" && notNull(args) ? (args as Record<string, unknown>) : {}
              const text = isString(params.text) ? params.text : ""
              logger.info(logger.CONTEXT.AI, "Respond tool intercepted (model → user)", {
                iteration: iterations,
                textLength: text.length,
                modelText: text.length > 600 ? `${text.slice(0, 600)}…` : text,
              })
              turn.appendStep({type: "respond", text, reasoning: iterationReasoning, reasoningDurationMs: iterationReasoningDurationMs})
              const synthetic: ToolResult = {success: true, summary: text}
              this.conversationHistory.push({
                role: "tool",
                content: toModelToolMessage(toolCall.function.name, synthetic),
                tool_call_id: toolCall.id,
              })
              respondTextForTurn = text
              continue
            }

            const decision = await this.hooks.runBeforeToolCall(ctx, toolCall)
            logger.info(logger.CONTEXT.AI, "Executing tool", {
              iteration: iterations,
              tool: toolCall.function.name,
              decision: decision.action,
              ...(decision.action === "skip" ? {reason: decision.reason} : {}),
            })

            turn.appendStep({
              type: "tool_call",
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              params: toolCall.function.arguments,
            })
            this.emit({
              type: "tool_started",
              turnId: turn.id,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              label: toolEventLabel(toolCall.function.name, toolCall.function.arguments),
            })

            let toolResult: ToolResult
            if (decision.action === "skip") {
              toolResult = {success: false, error: decision.reason}
            } else {
              toolResult = await this.executeToolCall(toolCall)
            }

            const resultSummary =
              toolResult.summary ?? (isString(toolResult.data) ? toolResult.data : (toolResult.error ?? (toolResult.success ? "Done" : "Failed")))
            logger.info(logger.CONTEXT.AI, "Tool result", {
              iteration: iterations,
              tool: toolCall.function.name,
              success: toolResult.success,
              summaryPreview: isString(resultSummary) ? resultSummary.slice(0, 160) + (resultSummary.length > 160 ? "…" : "") : null,
              ...(toolResult.error ? {error: toolResult.error} : {}),
            })

            await this.hooks.runAfterToolCall(ctx, toolCall, toolResult)

            turn.appendStep({
              type: "tool_result",
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              result: toPersistableToolResult(toolCall.function.name, toolResult),
            })
            this.emit({
              type: "tool_finished",
              turnId: turn.id,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              success: toolResult.success,
              summary: resultSummary,
            })

            toolCalls.push(toRendererToolCall(toolCall.function.name, toolResult))
            this.conversationHistory.push({
              role: "tool",
              content: toModelToolMessage(toolCall.function.name, toolResult),
              tool_call_id: toolCall.id,
            })
            const imageMessage = toModelImageMessage(toolCall.function.name, toolResult)
            if (imageMessage) imageMessagesForRound.push(imageMessage)
          }

          this.conversationHistory.push(...imageMessagesForRound)

          if (notNull(respondTextForTurn)) {
            logger.info(logger.CONTEXT.AI, "Agent loop ended via respond", {
              iteration: iterations,
              finalLength: respondTextForTurn.length,
            })
            finalContent = respondTextForTurn
            break
          }
        } else {
          const rawContent = this.assistantTextOf(assistantMessage)
          finalContent = filterThinkBlocks(rawContent)
          logger.info(logger.CONTEXT.AI, "Agent loop ended via fallback content (no tool calls)", {
            iteration: iterations,
            rawContentLength: rawContent.length,
            filteredLength: finalContent.length,
            modelText: finalContent.length > 600 ? `${finalContent.slice(0, 600)}…` : finalContent,
          })
          if (!finalContent) {
            finalContent = "I completed the request, but could not produce a visible final response."
          }
          this.conversationHistory.push({role: "assistant", content: finalContent})
          turn.appendStep({type: "respond", text: finalContent, reasoning: iterationReasoning, reasoningDurationMs: iterationReasoningDurationMs})
          break
        }
      }

      if (iterations >= maxIterations && !finalContent) {
        logger.warn(logger.CONTEXT.AI, `Agent loop hit max iterations (${maxIterations}) without final respond`, {
          turnId: turn.id,
          toolCallsCount: toolCalls.length,
          toolNames: toolCalls.map((tc) => tc.name),
        })
      }

      if (!finalContent) {
        finalContent = "I completed the request, but could not produce a visible final response."
      }

      const responseMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        toolCalls: toolCalls.length ? toolCalls : [],
      }

      turn.setFinalMessage(finalContent)
      turn.setStatus("completed")

      logger.info(logger.CONTEXT.AI, "Message processed", {
        turnId: turn.id,
        iterations,
        toolCallsCount: toolCalls.length,
        responseLength: finalContent.length,
      })

      this.emit({type: "turn_finished", turnId: turn.id, finalMessage: finalContent, finishedAt: Date.now(), usage: turn.usage})
      await this.persistTurn(turn, config)

      return {success: true, message: responseMessage}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.conversationHistory.length = historyStartIndex

      if (error instanceof Error && error.name === "AbortError") {
        turn.setStatus("cancelled")
        this.emit({type: "turn_cancelled", turnId: turn.id, finishedAt: Date.now()})
        await this.persistTurn(turn, config)
        return {success: false, error: "Request cancelled"}
      }

      turn.appendStep({type: "error", message})
      turn.setError(message)
      turn.setStatus("failed")

      logger.error(logger.CONTEXT.AI, "Failed to process message", error)
      this.emit({type: "turn_failed", turnId: turn.id, error: message, finishedAt: Date.now()})
      await this.persistTurn(turn, config)
      return {success: false, error: message}
    } finally {
      this.abortController = null
      release()
    }
  }

  private emit(event: AIEvent) {
    try {
      this.broadcastEvent?.(event)
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "broadcastEvent failed", err)
    }
  }

  private get activeProvider(): IAiClient {
    return this.config?.provider === "local" ? this.localClient : this.openaiClient
  }

  /**
   * Resolve any pending confirmation. If `expectedId` is provided and does
   * not match the live confirmation, this is a no-op (stale/late callback)
   * and returns false. Returns true when a pending confirmation is actually
   * resolved.
   */
  private resolvePendingConfirmation(confirmed: boolean, expectedId?: string): boolean {
    const pending = this.pendingConfirmation
    if (!pending) return false
    if (notUndefined(expectedId) && pending.id !== expectedId) return false

    clearTimeout(pending.timeoutId)
    this.pendingConfirmation = null

    try {
      this.broadcastConfirmation?.({type: "resolved", confirmationId: pending.id})
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "broadcastConfirmation failed", err)
    }

    pending.resolve(confirmed)
    return true
  }

  private async checkIdle(): Promise<void> {
    if (this.config?.provider !== "local") return
    const server = (this.localClient as any).server
    if (!server?.isRunning?.()) return
    const opt = (this.config.local?.unloadModel ?? "15m") as UnloadModelTime
    const ms = UNLOAD_MODEL_TIME[opt]
    if (isNull(ms)) return
    if (Date.now() - this.lastActivityAt <= ms) return
    logger.info(logger.CONTEXT.AI, "Idle timeout reached, unloading server")
    await server.stop()
  }

  private async persistTurn(turn: TurnBuilder, config: AIConfig): Promise<void> {
    try {
      const meta = {
        provider: config.provider,
        model: config.provider === "local" ? config.local?.model : config.openai?.model,
      }
      await this.storage.appendAiTurn(turn.snapshot(), meta)
      try {
        const turns = await this.storage.getActiveAiSessionTurns(50)
        this.compactor.refresh(turns)
      } catch (err) {
        logger.warn(logger.CONTEXT.AI, "Compactor refresh failed", err)
      }
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "Failed to persist AI turn", err)
    }
  }

  /**
   * The model is forced to use a tool every turn so every reply flows through
   * the `respond` envelope — makes structured output reliable.
   *
   * Thinking-mode remote models (DeepSeek-Reasoner, DeepSeek-V4-Flash,
   * OpenAI o-series, QwQ, etc.) reject `tool_choice="required"` with
   * `invalid_request_error` — their API spec only allows `auto` / `none`
   * once chain-of-thought is active. Detect them by model name and fall
   * back to `auto`.
   */
  private resolveToolChoice(config: AIConfig | null): ToolChoice {
    if (this.isRemoteThinkingModel(config)) return "auto"
    return "required"
  }

  private isRemoteThinkingModel(config: AIConfig | null): boolean {
    if (config?.provider !== "openai") return false
    const modelName = config.openai?.model?.toLowerCase() ?? ""
    if (!modelName) return false
    return this.isReasoningModelName(modelName)
  }

  private isReasoningModelName(modelName: string): boolean {
    return this.REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(modelName))
  }

  private resolveContextTokens(config: AIConfig): number | null {
    if (config.provider !== "local") return null
    const override = config.local?.params?.ctx
    if (typeof override === "number" && override > 0) return override
    const modelId = config.local?.model
    if (!modelId) return null
    const entry = this.localClient.modelService.getEntry(modelId)
    return entry?.serverArgs?.ctx ?? null
  }

  private async callLLM(
    messages: MessageLLM[],
    toolChoice: ToolChoice | undefined,
    compatMode: boolean,
    callbacks?: ChatStreamCallbacks,
  ): Promise<{message: MessageLLM; done: boolean; usage?: TokenUsage}> {
    let tools: Tool[] | undefined
    let resolvedToolChoice: ToolChoice | undefined
    if (!compatMode) {
      tools = AI_TOOLS
      resolvedToolChoice = toolChoice
    }

    try {
      return await this.activeProvider.chat(messages, tools, this.abortController?.signal, resolvedToolChoice, callbacks)
    } catch (err) {
      if (this.abortController?.signal.aborted) throw err
      if (!(err instanceof NonRetryableError)) throw err
      if (!this.isContentRejection(err)) throw err
      if (!messages.some(this.hasImageContent)) throw err

      logger.warn(logger.CONTEXT.AI, "Chat request carrying an image was rejected; retrying once without it", {
        error: err.message,
      })
      const withoutImages = messages.map((m) => this.withoutImageContent(m))
      const retried = await this.activeProvider.chat(withoutImages, tools, this.abortController?.signal, resolvedToolChoice, callbacks)

      this.conversationHistory = this.conversationHistory.map((m) => this.withoutImageContent(m))

      return retried
    }
  }

  private hasImageContent(message: MessageLLM): boolean {
    return isArray(message.content) && message.content.some((part) => part.type === "image_url")
  }

  private isContentRejection(err: NonRetryableError): boolean {
    const status = err.status
    if (status === undefined || status < 400 || status >= 500) return false
    return ![401, 403, 408, 429].includes(status)
  }

  private withoutImageContent(message: MessageLLM): MessageLLM {
    if (!isArray(message.content)) return message

    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")

    return {...message, content: `${text}\n(This model cannot see images.)`}
  }

  private isCompatMode(config: AIConfig): boolean {
    if (config.provider !== "local") return false
    const modelId = config.local?.model
    if (!modelId) return false
    const entry = this.localClient.modelService.getEntry(modelId)
    return entry?.capabilities?.tools === "compat"
  }

  private async executeToolCall(toolCall: ToolCallLLM): Promise<ToolResult> {
    if (!this.executor) return {success: false, error: "Executor not initialized"}

    const {name, arguments: args} = toolCall.function
    logger.debug(logger.CONTEXT.AI, `Tool call: ${name}`, redactToolParamsForLog(name, args))

    const validationError = this.validateToolArguments(name, args)
    if (validationError) {
      logger.warn(logger.CONTEXT.AI, `Tool call rejected: ${name}`, {error: validationError, ...redactToolParamsForLog(name, args)})
      return {success: false, error: validationError}
    }

    return this.executor.execute(name as ToolName, args as any, "in-app", {
      webRead: this.currentWebReadBudget ?? undefined,
      pageCache: this.pageCache,
    })
  }

  private validateToolArguments(toolName: string, args: unknown): string | null {
    const schema = this.currentToolSchemas.get(toolName)
    if (!schema) return `Tool '${toolName}' is not available`

    if (!args || typeof args !== "object" || isArray(args)) {
      return `Invalid arguments for '${toolName}': expected an object`
    }

    const params = args as Record<string, unknown>

    for (const key of schema.required ?? []) {
      if (isNullish(params[key])) {
        return `Invalid arguments for '${toolName}': '${key}' is required`
      }
    }

    for (const [key, descriptor] of Object.entries(schema.properties)) {
      const value = params[key]
      if (isNullish(value)) continue

      const typeMatches = this.isArgumentTypeValid(descriptor.type, value)
      if (!typeMatches) {
        const expected = isArray(descriptor.type) ? descriptor.type.join(" or ") : descriptor.type
        return `Invalid arguments for '${toolName}': '${key}' must be ${expected}`
      }

      if (descriptor.enum && !descriptor.enum.includes(String(value))) {
        return `Invalid arguments for '${toolName}': '${key}' must be one of ${descriptor.enum.join(", ")}`
      }
    }

    return null
  }

  private isArgumentTypeValid(expectedType: string | string[], value: unknown): boolean {
    if (isArray(expectedType)) return expectedType.some((type) => this.isArgumentTypeValid(type, value))
    if (expectedType === "null") return isNull(value)
    if (expectedType === "array") return isArray(value)
    if (expectedType === "number") return isNumber(value) && Number.isFinite(value)
    if (expectedType === "string") return isString(value)
    if (expectedType === "boolean") return isBoolean(value)
    if (expectedType === "object") return isObject(value)
    return true
  }

  private assistantTextOf(message: MessageLLM): string {
    return isString(message.content) ? message.content : ""
  }
}
