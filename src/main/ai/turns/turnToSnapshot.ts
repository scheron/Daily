import {isString} from "@shared/utils/common/validators"

import type {AgentTurn} from "@/ai/turns/types"
import type {AgentMessageSegment, AgentTurnSnapshot} from "@shared/types/ai"

/**
 * Reduce a persisted AgentTurn to the renderer-safe snapshot used by the
 * chat restore path. Pairs up tool_call + tool_result steps by toolCallId,
 * skips internal model_response noise, and never leaks step ids or step
 * payloads.
 */
export function turnToSnapshot(turn: AgentTurn): AgentTurnSnapshot {
  const toolCalls: Array<{name: string; result: string}> = []
  const segments: AgentMessageSegment[] = []

  for (let i = 0; i < turn.steps.length; i++) {
    const step = turn.steps[i]
    if (step.type === "model_response") {
      if (step.reasoning) {
        // Only emit reasoning from the model_response if this iteration does NOT
        // end with a respond step. When the model calls `respond` directly, the
        // respond step will carry the reasoning instead, avoiding a duplicate.
        const nextBoundary = turn.steps.slice(i + 1).find((s) => s.type === "respond" || s.type === "model_response")
        if (nextBoundary?.type !== "respond") {
          segments.push({kind: "reasoning", text: step.reasoning, durationMs: step.reasoningDurationMs})
        }
      }
    }
    if (step.type === "tool_result") {
      const summary =
        step.result?.summary ?? (isString(step.result?.data) ? step.result.data : (step.result?.error ?? (step.result?.success ? "Done" : "Failed")))
      toolCalls.push({name: step.toolName, result: summary})
      segments.push({
        kind: "tool",
        toolCallId: step.toolCallId,
        name: step.toolName,
        status: "done",
        success: step.result?.success ?? false,
        summary,
      })
    }
    if (step.type === "respond" && step.reasoning) {
      segments.push({kind: "reasoning", text: step.reasoning, durationMs: step.reasoningDurationMs})
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
    segments: segments.length ? segments : undefined,
    usage: turn.usage,
    error: turn.error,
  }
}
