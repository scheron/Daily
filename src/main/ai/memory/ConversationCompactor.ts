import {summarizeTurns} from "./deterministicSummary"

import type {TransformContextHook} from "@/ai/hooks/types"
import type {AgentTurn} from "@/ai/turns/types"
import type {MessageLLM} from "@/ai/types"

export type CompactorOptions = {
  /** Minimum messages in conversation prefix before compaction kicks in. */
  threshold: number
  /** How many recent messages to keep verbatim once compaction kicks in. */
  keepLastMessages: number
}

/**
 * Caches a deterministic summary of past turns and exposes it as a
 * `TransformContextHook`. The hook trims long conversation prefixes down
 * to the last N messages and splices the cached summary as a system
 * message right after the main system prompt — so the LLM still has
 * grounding without re-paying for every old user turn.
 *
 * `refresh()` should be called by AIController after each persisted turn
 * with the latest snapshot of past turns. Synchronous hook execution then
 * reads `summary` without async work.
 */
export class ConversationCompactor {
  private summary = ""

  refresh(turns: AgentTurn[]): void {
    this.summary = summarizeTurns(turns)
  }

  getSummary(): string {
    return this.summary
  }

  makeHook(opts: CompactorOptions): TransformContextHook {
    return (messages) => {
      if (!this.summary) return messages
      if (messages.length <= opts.threshold) return messages

      const systemPrefix: MessageLLM[] = []
      let bodyStart = 0
      while (bodyStart < messages.length && messages[bodyStart].role === "system") {
        systemPrefix.push(messages[bodyStart])
        bodyStart++
      }
      const body = messages.slice(bodyStart)
      let keepStart = Math.max(0, body.length - opts.keepLastMessages)
      // Skip forward to a safe boundary: tool messages and assistant
      // messages with tool_calls cannot be the head of the kept window —
      // OpenAI/DeepSeek API rejects orphan tool messages and orphan
      // assistant.tool_calls. Walk forward until we land on a user message,
      // a system message, or an assistant message without tool_calls.
      while (keepStart < body.length) {
        const m = body[keepStart]
        if (m.role === "tool") {
          keepStart++
          continue
        }
        if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
          keepStart++
          continue
        }
        break
      }
      const kept = body.slice(keepStart)
      const summaryMessage: MessageLLM = {
        role: "system",
        content: this.summary,
      }
      return [...systemPrefix, summaryMessage, ...kept]
    }
  }
}
