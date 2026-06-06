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
      const kept = body.slice(-opts.keepLastMessages)
      const summaryMessage: MessageLLM = {
        role: "system",
        content: this.summary,
      }
      return [...systemPrefix, summaryMessage, ...kept]
    }
  }
}
