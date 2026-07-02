import {invoke} from "@vueuse/core"

import {toISODate} from "@shared/utils/date/formatters"

import type {AgentTurnSnapshot, AIMessage} from "@shared/types/ai"
import type {AiSessionContext} from "../types"

/**
 * Restores the last durable AI session into the in-memory message list when the store
 * is created, mapping persisted turns back into user/assistant messages.
 * @param ctx - Shared message list and chat-start timestamp
 */
export function useAiSession(ctx: AiSessionContext) {
  const {messages, chatTimeStarted} = ctx

  invoke(async () => {
    if (messages.value.length > 0) return

    try {
      const {turns} = await window.BridgeIPC["ai:get-current-session"]()
      if (messages.value.length > 0 || !turns.length) return

      messages.value = turnsToMessages(turns)
      chatTimeStarted.value = toISODate(turns[0].startedAt)
    } catch {
      void 0
    }
  })

  function turnsToMessages(turns: AgentTurnSnapshot[]): AIMessage[] {
    const out: AIMessage[] = []
    for (const turn of turns) {
      out.push({
        id: `user_${turn.id}`,
        role: "user",
        content: turn.userMessage,
        timestamp: turn.startedAt,
      })

      const finalText = resolveTurnFinalText(turn)
      if (finalText) {
        out.push({
          id: `msg_${turn.id}`,
          role: "assistant",
          content: finalText,
          timestamp: turn.finishedAt ?? turn.startedAt,
          segments: turn.segments,
          usage: turn.usage,
        })
      }
    }
    return out
  }

  function resolveTurnFinalText(turn: AgentTurnSnapshot): string {
    if (turn.finalMessage) return turn.finalMessage
    if (turn.status === "failed") return `Error: ${turn.error ?? "unknown"}`
    if (turn.status === "cancelled") return "Request cancelled."
    return ""
  }
}
