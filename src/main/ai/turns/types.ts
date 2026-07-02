import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM} from "@/ai/types"
import type {PendingToolConfirmation, TokenUsage} from "@shared/types/ai"

/**
 * Lifecycle states of an AgentTurn.
 *
 * - `running`              — the loop is iterating; LLM or tools in flight.
 * - `waiting_confirmation` — a destructive tool needs user approval (Phase 3).
 * - `completed`            — the turn produced a final user-visible message.
 * - `failed`               — an error terminated the loop.
 * - `cancelled`            — the user aborted via `cancel()`.
 */
export type AgentTurnStatus = "running" | "completed" | "failed" | "cancelled" | "waiting_confirmation"

/**
 * One observable event within a turn. The discriminated union mirrors what
 * the loop actually does so that Phase 5 persistence and Phase 7 event-
 * streaming have a single source of structured truth.
 */
export type AgentStep =
  | {id: string; type: "model_response"; createdAt: number; message: MessageLLM; reasoning?: string; reasoningDurationMs?: number}
  | {id: string; type: "tool_call"; createdAt: number; toolCallId: string; toolName: string; params: unknown}
  | {id: string; type: "tool_result"; createdAt: number; toolCallId: string; toolName: string; result: ToolResult}
  | {id: string; type: "respond"; createdAt: number; text: string; reasoning?: string; reasoningDurationMs?: number}
  | {id: string; type: "confirmation_request"; createdAt: number; confirmation: PendingToolConfirmation}
  | {id: string; type: "error"; createdAt: number; message: string}

/**
 * First-class execution unit for a user request. One turn per
 * `AIController.sendMessage` invocation. Phase 4 keeps these in-memory only;
 * Phase 5 will persist them to SQLite.
 */
export type AgentTurn = {
  id: string
  sessionId?: string
  userMessage: string
  startedAt: number
  finishedAt?: number
  status: AgentTurnStatus
  steps: AgentStep[]
  finalMessage?: string
  error?: string
  usage?: TokenUsage
}
