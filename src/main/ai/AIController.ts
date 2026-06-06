import {nanoid} from "nanoid"

import {deepMerge} from "@shared/utils/common/deepMerge"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {logger} from "@/utils/logger"

import {LocalAiClient} from "@/ai/clients/local"
import {getManifestEntry} from "@/ai/clients/local/core/manifest"
import {RemoteAiClient} from "@/ai/clients/remote"
import {HookChain} from "@/ai/hooks/HookChain"
import {ConversationCompactor} from "@/ai/memory/ConversationCompactor"
import {describeToolCall} from "@/ai/policy/describeToolCall"
import {createPolicyHook} from "@/ai/policy/policyHook"
import {DEFAULT_CONFIRMATION_TIMEOUT_MS} from "@/ai/policy/types"
import {getSystemPrompt} from "@/ai/promts/getSystemPrompt"
import {getSystemPromptCompact} from "@/ai/promts/getSystemPromptCompact"
import {getSystemPromptTiny} from "@/ai/promts/getSystemPromptTiny"
import {toModelToolMessage, toRendererToolCall} from "@/ai/tools/format"
import {AI_TOOLS, AI_TOOLS_COMPACT} from "@/ai/tools/registry"
import {ToolExecutor} from "@/ai/tools/ToolExecutor"
import {TurnBuilder} from "@/ai/turns/TurnBuilder"
import {filterThinkBlocks} from "./utils/filterThinkBlocks"

import type {ILocalModelService} from "@/ai/clients/local"
import type {AgentContext} from "@/ai/hooks/types"
import type {PendingConfirmation} from "@/ai/policy/types"
import type {ToolName} from "@/ai/tools/registry"
import type {ToolResult} from "@/ai/tools/types"
import type {AgentTurn} from "@/ai/turns/types"
import type {IAiClient, MessageLLM, PromptTier, Tool, ToolCallLLM, ToolChoice} from "@/ai/types"
import type {StorageController} from "@/storage/StorageController"
import type {AgentTurnSnapshot, AIConfig, AIEvent, AIMessage, AIResponse, LocalRuntimeState, PendingToolConfirmation} from "@shared/types/ai"

/**
 * Event emitted to the renderer when a destructive tool call needs user
 * confirmation, or when a previously-pending confirmation is resolved.
 * The renderer subscribes via the `ai:on-confirmation-required` /
 * `ai:on-confirmation-resolved` IPC channels.
 */
export type ConfirmationBroadcastEvent = {type: "required"; confirmation: PendingToolConfirmation} | {type: "resolved"; confirmationId: string}

/**
 * Reduce a persisted AgentTurn to the renderer-safe snapshot used by the
 * chat restore path. Pairs up tool_call + tool_result steps by toolCallId,
 * skips internal model_response noise, and never leaks step ids or step
 * payloads.
 */
function turnToSnapshot(turn: AgentTurn): AgentTurnSnapshot {
  const toolCalls: Array<{name: string; result: string}> = []
  for (const step of turn.steps) {
    if (step.type === "tool_result") {
      const name = step.toolName
      const result =
        step.result?.summary ??
        (typeof step.result?.data === "string" ? step.result.data : (step.result?.error ?? (step.result?.success ? "Done" : "Failed")))
      toolCalls.push({name, result})
    }
  }
  return {
    id: turn.id,
    userMessage: turn.userMessage,
    finalMessage: turn.finalMessage ?? null,
    startedAt: turn.startedAt,
    finishedAt: turn.finishedAt ?? null,
    status: turn.status,
    toolCalls,
    error: turn.error,
  }
}

export class AIController {
  private openaiClient: RemoteAiClient
  private localClient: LocalAiClient
  private executor: ToolExecutor
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig | null = null
  private currentToolSchemas = new Map<string, Tool["function"]["parameters"]>()
  private sendMutex = new AsyncMutex()
  private hooks = new HookChain()
  private pendingConfirmation: PendingConfirmation | null = null
  private compactor = new ConversationCompactor()

  constructor(
    private storage: StorageController,
    broadcastState?: (state: LocalRuntimeState) => void,
    private broadcastConfirmation?: (event: ConfirmationBroadcastEvent) => void,
    private broadcastEvent?: (event: AIEvent) => void,
  ) {
    this.executor = new ToolExecutor(storage)
    this.openaiClient = new RemoteAiClient()
    this.localClient = new LocalAiClient(broadcastState)
  }

  private emit(event: AIEvent): void {
    try {
      this.broadcastEvent?.(event)
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "broadcastEvent failed", err)
    }
  }

  private get activeProvider(): IAiClient {
    return this.config?.provider === "local" ? this.localClient : this.openaiClient
  }

  async init() {
    const config = (await this.storage.loadSettings()).ai
    await this.localClient.modelService.init()
    await this.updateConfig(config)
    this.hooks.registerBeforeToolCall(createPolicyHook(this))
    // Compaction hook uses conservative defaults that fit the largest tier;
    // smaller tiers tolerate it because compaction only kicks in once the
    // threshold is exceeded.
    this.hooks.registerTransformContext(this.compactor.makeHook({threshold: 30, keepLastMessages: 16}))
    // Seed the summary from the persisted active session, if any, so the
    // first turn after app start already has memory.
    try {
      const turns = await this.storage.getActiveAiSessionTurns(50)
      this.compactor.refresh(turns)
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "Compactor initial refresh failed", err)
    }
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
    return this.activeProvider.checkConnection()
  }

  async listModels(): Promise<string[]> {
    return this.activeProvider.listModels()
  }

  getLocalModel(): ILocalModelService {
    return this.localClient.modelService
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

  /**
   * Called from the policy hook. Returns when the user confirms, cancels,
   * or the timer fires. Resolves to `true` on confirm, `false` otherwise.
   */
  async awaitConfirmation(toolName: string, params: unknown): Promise<boolean> {
    // Defensive: clear any stale pending confirmation. The mutex ordinarily
    // prevents two confirmations from coexisting, but a stuck timer or a
    // re-entrant test could leave one behind.
    this.resolvePendingConfirmation(false)

    const description = describeToolCall(toolName, params)
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

  /**
   * Resolve any pending confirmation. If `expectedId` is provided and does
   * not match the live confirmation, this is a no-op (stale/late callback)
   * and returns false. Returns true when a pending confirmation is actually
   * resolved.
   */
  private resolvePendingConfirmation(confirmed: boolean, expectedId?: string): boolean {
    const pending = this.pendingConfirmation
    if (!pending) return false
    if (expectedId !== undefined && pending.id !== expectedId) return false

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

  async sendMessage(userMessage: string): Promise<AIResponse> {
    if (!this.executor) return {success: false, error: "Storage not initialized"}

    const release = this.sendMutex.tryLock()
    if (!release) {
      return {success: false, error: "AI assistant is already processing a message"}
    }

    const config = (await this.storage.loadSettings()).ai
    if (!config?.enabled) {
      release()
      return {success: false, error: "AI assistant is disabled"}
    }

    logger.info(logger.CONTEXT.AI, "Processing message", {messageLength: userMessage.length, provider: config.provider})

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
      const promptTier = this.resolvePromptTier(config)
      const systemPrompt = this.getSystemPromptByTier(promptTier)
      logger.debug(logger.CONTEXT.AI, "Prompt tier selected", {
        tier: promptTier,
        provider: config.provider,
        model: config.openai?.model ?? config.local?.model,
        systemPromptLength: systemPrompt.length,
      })

      while (iterations < maxIterations) {
        iterations++

        const baseMessages: MessageLLM[] = [{role: "system", content: systemPrompt}, ...this.conversationHistory]

        const messages = [...this.hooks.runTransformContext(baseMessages)]

        const lastUserMessage = [...this.conversationHistory].reverse().find((m) => m.role === "user")
        logger.debug(logger.CONTEXT.AI, "Prepared LLM messages", {
          iteration: iterations,
          messagesCount: messages.length,
          lastUserMessageLength: lastUserMessage?.content?.length ?? 0,
          systemPromptLength: systemPrompt.length,
        })

        this.emit({type: "model_requested", turnId: turn.id, iteration: iterations})
        const response = await this.callLLM(messages, promptTier, "required")
        const assistantMessage = response.message

        turn.appendStep({type: "model_response", message: assistantMessage})
        this.emit({
          type: "model_responded",
          turnId: turn.id,
          iteration: iterations,
          hasToolCalls: Boolean(assistantMessage.tool_calls?.length),
        })

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
          this.conversationHistory.push(assistantMessage)

          let respondTextForTurn: string | null = null

          for (const toolCall of assistantMessage.tool_calls) {
            // The `respond` tool is the agent's user-facing communication
            // channel. The loop intercepts it: no hook, no executor, no
            // history of a real tool result. The text becomes the final
            // message and the outer loop breaks after this iteration.
            if (toolCall.function.name === "respond") {
              const args = toolCall.function.arguments
              const params = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {}
              const text = typeof params.text === "string" ? params.text : ""
              turn.appendStep({type: "respond", text})
              const synthetic: ToolResult = {success: true, summary: text}
              this.conversationHistory.push({
                role: "tool",
                content: toModelToolMessage(synthetic),
                tool_call_id: toolCall.id,
              })
              respondTextForTurn = text
              continue
            }

            const decision = await this.hooks.runBeforeToolCall(ctx, toolCall)

            turn.appendStep({
              type: "tool_call",
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              params: toolCall.function.arguments,
            })
            this.emit({type: "tool_started", turnId: turn.id, toolCallId: toolCall.id, toolName: toolCall.function.name})

            let toolResult: ToolResult
            if (decision.action === "skip") {
              toolResult = {success: false, error: decision.reason}
            } else {
              toolResult = await this.executeToolCall(toolCall)
            }

            await this.hooks.runAfterToolCall(ctx, toolCall, toolResult)

            turn.appendStep({
              type: "tool_result",
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              result: toolResult,
            })
            this.emit({
              type: "tool_finished",
              turnId: turn.id,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              success: toolResult.success,
              summary:
                toolResult.summary ??
                (typeof toolResult.data === "string" ? toolResult.data : (toolResult.error ?? (toolResult.success ? "Done" : "Failed"))),
            })

            toolCalls.push(toRendererToolCall(toolCall.function.name, toolResult))
            this.conversationHistory.push({
              role: "tool",
              content: toModelToolMessage(toolResult),
              tool_call_id: toolCall.id,
            })
          }

          if (respondTextForTurn !== null) {
            finalContent = respondTextForTurn
            break
          }
        } else {
          // Degraded provider: ignored tool_choice and returned plain
          // content. Use it as a fallback final message so the assistant
          // remains usable on non-compliant backends.
          const rawContent = assistantMessage.content ?? ""
          finalContent = filterThinkBlocks(rawContent)
          if (!finalContent) {
            finalContent = "I completed the request, but could not produce a visible final response."
          }
          this.conversationHistory.push({role: "assistant", content: finalContent})
          turn.appendStep({type: "respond", text: finalContent})
          break
        }
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

      this.emit({type: "turn_finished", turnId: turn.id, finalMessage: finalContent, finishedAt: Date.now()})
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

  private async persistTurn(turn: TurnBuilder, config: AIConfig): Promise<void> {
    try {
      const meta = {
        provider: config.provider,
        model: config.provider === "local" ? config.local?.model : config.openai?.model,
      }
      await this.storage.appendAiTurn(turn.snapshot(), meta)
      // Refresh the compactor summary after a successful append so the next
      // turn's TransformContextHook reflects the latest history. Failures
      // here are non-fatal — compaction is best-effort.
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

  private getSystemPromptByTier(tier: PromptTier): string {
    if (tier === "tiny") return getSystemPromptTiny()
    if (tier === "medium") return getSystemPromptCompact()
    return getSystemPrompt()
  }

  private resolvePromptTier(config: AIConfig | null): PromptTier {
    if (config?.provider === "local") {
      const modelId = config.local?.model
      if (!modelId) return "medium"
      return getManifestEntry(modelId)?.promptTier ?? "medium"
    }

    const modelName = config?.openai?.model?.toLowerCase() ?? ""
    if (!modelName) return "large"

    if (modelName.includes("nano")) return "tiny"
    if (modelName.includes("mini") || modelName.includes("small")) return "medium"

    const sizeMatch = modelName.match(/(\d+(?:\.\d+)?)b/)
    if (sizeMatch) {
      const sizeB = Number(sizeMatch[1])
      if (!Number.isNaN(sizeB)) {
        if (sizeB <= 4) return "tiny"
        if (sizeB <= 14) return "medium"
      }
    }

    return "large"
  }

  private async callLLM(messages: MessageLLM[], promptTier: PromptTier, toolChoice?: ToolChoice): Promise<{message: MessageLLM; done: boolean}> {
    const tools = this.getToolsForTier(promptTier)
    this.currentToolSchemas = new Map(tools.map((tool) => [tool.function.name, tool.function.parameters]))
    return this.activeProvider.chat(messages, tools, this.abortController?.signal, toolChoice)
  }

  private async executeToolCall(toolCall: ToolCallLLM): Promise<{success: boolean; data?: string; error?: string}> {
    if (!this.executor) return {success: false, error: "Executor not initialized"}

    const {name, arguments: args} = toolCall.function
    logger.debug(logger.CONTEXT.AI, `Tool call: ${name}`, args)

    const validationError = this.validateToolArguments(name, args)
    if (validationError) {
      logger.warn(logger.CONTEXT.AI, `Tool call rejected: ${name}`, {error: validationError, args})
      return {success: false, error: validationError}
    }

    const result = await this.executor.execute(name as ToolName, args as any, "in-app")
    return {
      success: result.success,
      data: typeof result.data === "string" ? result.data : JSON.stringify(result.data),
      error: result.error,
    }
  }

  private getToolsForTier(promptTier: PromptTier): Tool[] {
    return promptTier === "large" ? AI_TOOLS : AI_TOOLS_COMPACT
  }

  private validateToolArguments(toolName: string, args: unknown): string | null {
    const schema = this.currentToolSchemas.get(toolName)
    if (!schema) return `Tool '${toolName}' is not available for this model tier`

    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return `Invalid arguments for '${toolName}': expected an object`
    }

    const params = args as Record<string, unknown>

    for (const key of schema.required ?? []) {
      if (params[key] === undefined || params[key] === null) {
        return `Invalid arguments for '${toolName}': '${key}' is required`
      }
    }

    for (const [key, descriptor] of Object.entries(schema.properties)) {
      const value = params[key]
      if (value === undefined || value === null) continue

      const typeMatches = this.isArgumentTypeValid(descriptor.type, value)
      if (!typeMatches) {
        return `Invalid arguments for '${toolName}': '${key}' must be ${descriptor.type}`
      }

      if (descriptor.enum && !descriptor.enum.includes(String(value))) {
        return `Invalid arguments for '${toolName}': '${key}' must be one of ${descriptor.enum.join(", ")}`
      }
    }

    return null
  }

  private isArgumentTypeValid(expectedType: string, value: unknown): boolean {
    if (expectedType === "array") return Array.isArray(value)
    if (expectedType === "number") return typeof value === "number" && Number.isFinite(value)
    if (expectedType === "string") return typeof value === "string"
    if (expectedType === "boolean") return typeof value === "boolean"
    if (expectedType === "object") return typeof value === "object" && value !== null && !Array.isArray(value)
    return true
  }
}
