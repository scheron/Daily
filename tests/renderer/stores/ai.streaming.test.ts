// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

// Capture IPC listeners installed by the store
const eventListeners: Array<(event: any) => void> = []

beforeEach(() => {
  vi.useFakeTimers()
  eventListeners.length = 0
  mockBridgeIPC({
    "ai:on-event": (cb: (e: any) => void) => eventListeners.push(cb),
    "ai:on-confirmation-required": vi.fn(),
    "ai:on-confirmation-resolved": vi.fn(),
    "ai:get-current-session": vi.fn(async () => ({turns: []})),
    "ai:on-local-state-changed": vi.fn(),
    "ai:on-local-download-progress": vi.fn(),
    "ai:on-local-catalog-changed": vi.fn(),
  })
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

function fire(event: any) {
  eventListeners.forEach((cb) => cb(event))
}

// Advance past the throttled flush window so buffered deltas are applied.
function flushStreaming() {
  vi.advanceTimersByTime(60)
}

async function loadStore() {
  const mod = await import("@/stores/ai/ai.store")
  return mod.useAiStore()
}

describe("aiStore streaming reducers", () => {
  it("turn_started pushes a streaming live message", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "hi", startedAt: 100})
    const last = store.messages.at(-1)
    expect(last?.status).toBe("streaming")
    expect(last?.segments).toEqual([])
  })

  it("model_reasoning_delta appends to current reasoning segment", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "hi", startedAt: 100})
    fire({type: "model_requested", turnId: "T1", iteration: 1})
    fire({type: "model_reasoning_delta", turnId: "T1", iteration: 1, text: "abc"})
    fire({type: "model_reasoning_delta", turnId: "T1", iteration: 1, text: "def"})
    flushStreaming()
    const segs = store.messages.at(-1)?.segments ?? []
    expect(segs[0]?.kind).toBe("reasoning")
    expect((segs[0] as any).text).toBe("abcdef")
  })

  it("model_content_delta appends to content", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "model_content_delta", turnId: "T1", iteration: 1, text: "Hello "})
    fire({type: "model_content_delta", turnId: "T1", iteration: 1, text: "world"})
    flushStreaming()
    expect(store.messages.at(-1)?.content).toBe("Hello world")
  })

  it("tool_started + tool_finished updates the same segment by toolCallId", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "tool_started", turnId: "T1", toolCallId: "c1", toolName: "list_tasks"})
    let seg = store.messages.at(-1)?.segments?.[0]
    expect(seg?.kind).toBe("tool")
    expect((seg as any).status).toBe("running")
    fire({type: "tool_finished", turnId: "T1", toolCallId: "c1", toolName: "list_tasks", success: true, summary: "5 tasks"})
    seg = store.messages.at(-1)?.segments?.[0]
    expect((seg as any).status).toBe("done")
    expect((seg as any).success).toBe(true)
    expect((seg as any).summary).toBe("5 tasks")
  })

  it("turn_finished marks status complete and sets content", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "turn_finished", turnId: "T1", finalMessage: "final answer", finishedAt: 1})
    expect(store.messages.at(-1)?.status).toBe("complete")
    expect(store.messages.at(-1)?.content).toBe("final answer")
  })

  it("turn_cancelled marks status cancelled, preserves segments", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "model_requested", turnId: "T1", iteration: 1})
    fire({type: "model_reasoning_delta", turnId: "T1", iteration: 1, text: "partial"})
    fire({type: "turn_cancelled", turnId: "T1", finishedAt: 1})
    expect(store.messages.at(-1)?.status).toBe("cancelled")
    expect(store.messages.at(-1)?.segments?.length).toBe(1)
  })

  it("ignores events for a different turnId", async () => {
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "model_content_delta", turnId: "T2", iteration: 1, text: "ignored"})
    expect(store.messages.at(-1)?.content).toBe("")
  })

  it("does not create an empty reasoning segment when no reasoning deltas arrive", async () => {
    // Non-thinking models (e.g. Qwen3-4B-Instruct) never emit reasoning deltas.
    // model_requested alone must not seed an empty reasoning block.
    const store = await loadStore()
    fire({type: "turn_started", turnId: "T1", userMessage: "x", startedAt: 0})
    fire({type: "model_requested", turnId: "T1", iteration: 1})
    fire({type: "model_content_delta", turnId: "T1", iteration: 1, text: "answer"})
    fire({type: "model_requested", turnId: "T1", iteration: 2})
    fire({type: "turn_finished", turnId: "T1", finalMessage: "answer", finishedAt: 1})
    const segs = store.messages.at(-1)?.segments ?? []
    expect(segs.filter((s: any) => s.kind === "reasoning")).toHaveLength(0)
  })
})
