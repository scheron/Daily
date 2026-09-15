import {invoke} from "@vueuse/core"

import {toISODate} from "@daily/std"

import type {ISODate} from "@daily/protocol"
import type {AgentTurnSnapshot, AIMessage} from "@shared/types/ai"
import type {Ref} from "vue"

type AiSessionContext = {
  messages: Ref<AIMessage[]>
  chatTimeStarted: Ref<ISODate | null>
}

export function useAiSession(ctx: AiSessionContext) {
  const {messages, chatTimeStarted} = ctx

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

  invoke(async () => {
    if (messages.value.length > 0) return

    try {
      const {turns} = await window.BridgeIPC["ai:get-current-session"]()
      if (messages.value.length > 0 || !turns.length) return

      messages.value = turnsToMessages(turns)
      chatTimeStarted.value = toISODate(turns[0].startedAt)
    } catch {}
  })
}
