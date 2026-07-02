import {toModelToolMessage} from "@/ai/tools/format"

import type {AgentTurn} from "@/ai/turns/types"
import type {MessageLLM} from "@/ai/types"

/**
 * Rebuild the in-memory conversation history (LLM-side messages) from a
 * sequence of persisted AgentTurns. Used on app start so the agent picks up
 * the active session without losing context.
 *
 * Each turn produces: {user message} + (per model_response step) assistant
 * message with any tool_calls + (per tool_result) tool message tied by
 * tool_call_id. reasoning_content is stripped — it never enters the LLM
 * context outbound.
 */
export function restoreConversationHistory(turns: AgentTurn[]): MessageLLM[] {
  const history: MessageLLM[] = []
  for (const turn of turns) {
    history.push({role: "user", content: turn.userMessage})
    for (const step of turn.steps) {
      if (step.type === "model_response") {
        const message: MessageLLM = {...step.message}
        delete message.reasoning_content
        history.push(message)
      } else if (step.type === "tool_result") {
        history.push({
          role: "tool",
          content: toModelToolMessage(step.result),
          tool_call_id: step.toolCallId,
        })
      }
    }
  }
  return history
}
