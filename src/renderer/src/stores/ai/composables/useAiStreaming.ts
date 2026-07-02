import {throttle} from "@shared/utils/common/throttle"
import {isUndefined, notUndefined} from "@shared/utils/common/validators"

import type {AIMessage} from "@shared/types/ai"
import type {AiStreamingContext} from "../types"

const FLUSH_INTERVAL_MS = 50

/**
 * Bridges the main-process agent-loop event stream to the message list: appends a live
 * assistant message per turn and applies buffered content/reasoning deltas, tool-call
 * lifecycle, and terminal turn states (finished/failed/cancelled).
 *
 * Deltas fill two string buffers that a trailing {@link throttle} applies to the live
 * message at most every {@link FLUSH_INTERVAL_MS}, so a fast token stream repaints
 * smoothly instead of once per token. Boundary events flush the buffers immediately.
 * @param ctx - Shared message list the live turn is written into
 */
export function useAiStreaming(ctx: AiStreamingContext) {
  const {messages} = ctx

  let contentBuffer = ""
  let reasoningBuffer = ""

  const flushBuffers = throttle(applyBuffers, FLUSH_INTERVAL_MS)

  window.BridgeIPC["ai:on-event"]((event) => {
    if (event.type === "turn_started") {
      flushBuffers.clear()
      contentBuffer = ""
      reasoningBuffer = ""
      messages.value.push({
        id: `live_${event.turnId}`,
        role: "assistant",
        content: "",
        timestamp: event.startedAt,
        segments: [],
        status: "streaming",
      })
      return
    }

    const live = messages.value.at(-1)
    if (!live || live.role !== "assistant" || !live.id.startsWith(`live_${event.turnId}`)) return

    if (event.type === "model_reasoning_delta") {
      reasoningBuffer += event.text
      flushBuffers()
      return
    }

    if (event.type === "model_content_delta") {
      if (reasoningBuffer || (live.segments ?? []).at(-1)?.kind === "reasoning") {
        flushBuffers.immediate()
        finalizeLastReasoning(live)
      }
      contentBuffer += event.text
      flushBuffers()
      return
    }

    if (event.type === "tool_started") {
      flushBuffers.immediate()
      finalizeLastReasoning(live)
      live.segments = live.segments ?? []
      live.segments.push({
        kind: "tool",
        toolCallId: event.toolCallId,
        name: event.toolName,
        status: "running",
        label: event.label,
      })
      return
    }

    if (event.type === "tool_finished") {
      const segments = live.segments ?? []
      const tool = segments.find((s) => s.kind === "tool" && s.toolCallId === event.toolCallId)
      if (tool?.kind === "tool") {
        tool.status = "done"
        tool.success = event.success
        tool.summary = event.summary
      }
      return
    }

    if (event.type === "turn_finished") {
      flushBuffers.clear()
      contentBuffer = ""
      reasoningBuffer = ""
      finalizeLastReasoning(live)
      live.content = event.finalMessage
      live.status = "complete"
      live.timestamp = event.finishedAt
      live.usage = event.usage
      return
    }

    if (event.type === "turn_failed") {
      flushBuffers.immediate()
      finalizeLastReasoning(live)
      live.status = "failed"
      live.error = event.error
      live.timestamp = event.finishedAt
      return
    }

    if (event.type === "turn_cancelled") {
      flushBuffers.immediate()
      finalizeLastReasoning(live)
      live.status = "cancelled"
      live.timestamp = event.finishedAt
      return
    }
  })

  function applyBuffers() {
    const live = messages.value.at(-1)
    if (!live || live.role !== "assistant" || !live.id.startsWith("live_")) {
      contentBuffer = ""
      reasoningBuffer = ""
      return
    }

    if (reasoningBuffer) {
      const segments = (live.segments = live.segments ?? [])
      const last = segments.at(-1)
      if (last?.kind === "reasoning") last.text += reasoningBuffer
      else segments.push({kind: "reasoning", text: reasoningBuffer, startedAt: Date.now()})
      reasoningBuffer = ""
    }

    if (contentBuffer) {
      live.content += contentBuffer
      contentBuffer = ""
    }
  }

  function finalizeLastReasoning(live: AIMessage) {
    const segments = live.segments ?? []
    const last = segments.at(-1)
    if (last?.kind === "reasoning" && isUndefined(last.durationMs) && notUndefined(last.startedAt)) {
      last.durationMs = Date.now() - last.startedAt
    }
  }
}
