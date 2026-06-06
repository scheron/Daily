import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM, ToolCallLLM} from "@/ai/types"

/**
 * Minimal turn shape available to hooks. Phase 4 will expand this when the
 * Turn entity lands — for now hooks see the user message and the live
 * conversation prefix.
 */
export type AgentContext = {
  turnId: string
  userMessage: string
  startedAt: number
  /** Live snapshot of conversation history at the moment the hook fires. */
  messages: ReadonlyArray<MessageLLM>
}

export type BeforeToolCallDecision = {action: "pass"} | {action: "skip"; reason: string}

/**
 * Runs before each tool call. May skip the tool — when "skip" is returned,
 * the loop synthesizes a ToolResult with `success: false, error: reason` and
 * feeds it to the model as if the tool itself had refused.
 *
 * Phase 3's policy hook returns "skip" when a destructive tool needs
 * confirmation that has not yet been granted.
 */
export type BeforeToolCallHook = (ctx: AgentContext, call: ToolCallLLM) => Promise<BeforeToolCallDecision>

/**
 * Runs after each tool call (whether it ran or was skipped). Used for
 * logging, metrics, quota counters. Cannot influence the loop.
 */
export type AfterToolCallHook = (ctx: AgentContext, call: ToolCallLLM, result: ToolResult) => Promise<void>

/**
 * Transforms the conversation prefix before it is sent to the LLM. Applied
 * in registration order. Phase 8's compactor replaces old turns with a
 * summary using this hook.
 */
export type TransformContextHook = (messages: ReadonlyArray<MessageLLM>) => ReadonlyArray<MessageLLM>
