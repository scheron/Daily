import {ThinkBlockSplitter} from "./thinkBlockSplitter"

import type {ChatStreamDelta, MessageLLM, ToolCallLLM} from "@/ai/types"

type RawDelta = {
  role?: string
  content?: string
  reasoning_content?: string
  tool_calls?: Array<{
    index: number
    id?: string
    type?: "function"
    function?: {name?: string; arguments?: string}
  }>
}

type ToolBuilder = {id: string; name: string; argsBuffer: string}

export class ChatStreamAccumulator {
  private contentBuffer = ""
  private reasoningBuffer = ""
  private splitter = new ThinkBlockSplitter()
  private toolCalls = new Map<number, ToolBuilder>()
  private finishReason: string | null = null
  private emittedAny = false

  feed(delta: RawDelta, emit: (d: ChatStreamDelta) => void) {
    const wrappedEmit = (d: ChatStreamDelta) => {
      this.emittedAny = true
      if (d.kind === "content") this.contentBuffer += d.text
      else this.reasoningBuffer += d.text
      emit(d)
    }

    if (delta.reasoning_content) {
      wrappedEmit({kind: "reasoning", text: delta.reasoning_content})
    }

    if (delta.content) {
      this.splitter.push(delta.content, (kind, text) => {
        wrappedEmit({kind, text})
      })
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = this.toolCalls.get(tc.index)
        if (existing) {
          if (tc.function?.arguments) existing.argsBuffer += tc.function.arguments
          if (!existing.name && tc.function?.name) existing.name = tc.function.name
        } else {
          this.toolCalls.set(tc.index, {
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
            argsBuffer: tc.function?.arguments ?? "",
          })
        }
      }
    }
  }

  setFinishReason(reason: string) {
    this.finishReason = reason
  }

  flush(emit: (d: ChatStreamDelta) => void) {
    this.splitter.flush((kind, text) => {
      if (!text) return
      this.emittedAny = true
      if (kind === "content") this.contentBuffer += text
      else this.reasoningBuffer += text
      emit({kind, text})
    })
  }

  hasEmittedAny(): boolean {
    return this.emittedAny
  }

  toMessage(): MessageLLM {
    const tool_calls: ToolCallLLM[] = []
    const sorted = [...this.toolCalls.entries()].sort(([a], [b]) => a - b)
    for (const [, t] of sorted) {
      let args: Record<string, unknown> | string = t.argsBuffer
      try {
        args = JSON.parse(t.argsBuffer) as Record<string, unknown>
      } catch {
        args = t.argsBuffer
      }
      tool_calls.push({
        id: t.id,
        type: "function",
        function: {name: t.name, arguments: args},
      })
    }

    const message: MessageLLM = {
      role: "assistant",
      content: this.contentBuffer || null,
    }
    if (tool_calls.length) message.tool_calls = tool_calls
    if (this.reasoningBuffer) (message as any).reasoning_content = this.reasoningBuffer
    return message
  }
}
