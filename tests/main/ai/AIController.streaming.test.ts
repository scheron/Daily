// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

vi.mock("@main/ai/clients/local/core/LocalModelService", () => ({
  LocalModelService: class {
    catalog: any[] = []
    async init() {}
    getEntry() {
      return undefined
    }
    getCatalog() {
      return []
    }
    async isInstalled() {
      return false
    }
    getModelPath() {
      return "/tmp/x"
    }
    async listModels() {
      return []
    }
    async downloadModel() {
      return true
    }
    async cancelDownload() {
      return true
    }
    async deleteModel() {
      return true
    }
    async getDiskUsage() {
      return {total: 0, models: {}}
    }
  },
}))

function makeStorage(provider: "local" | "openai" = "local") {
  const appendedTurns: any[] = []
  return {
    loadSettings: vi.fn(async () => ({
      ai: {
        enabled: true,
        provider,
        local: provider === "local" ? {model: "qwen3-4b-instruct"} : null,
        openai: provider === "openai" ? {model: "x", baseUrl: "y", apiKey: "z"} : null,
      },
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async (turn: any) => {
      appendedTurns.push(turn)
    }),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => appendedTurns),
    _appendedTurns: appendedTurns,
  }
}

function makeStreamingMock(deltas: Array<{kind: "content" | "reasoning"; text: string}>, finalMessage: any) {
  return vi.fn(async (_msgs, _tools, _signal, _toolChoice, callbacks) => {
    for (const d of deltas) {
      callbacks?.onDelta?.(d)
      await new Promise((r) => setTimeout(r, 1))
    }
    return {message: finalMessage, done: true}
  })
}

describe("AIController streaming", () => {
  it("persists reasoning + duration on model_response step", async () => {
    // Advance Date.now() by 10ms between each call so reasoningDurationMs is deterministic
    let fakeTime = 1_000_000
    vi.spyOn(Date, "now").mockImplementation(() => (fakeTime += 10))

    const storage = makeStorage()
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient, "chat").mockImplementation(
      makeStreamingMock(
        [
          {kind: "reasoning", text: "let me think"},
          {kind: "content", text: ""},
        ],
        {role: "assistant", content: "", tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "hi"}}}]},
      ),
    )

    const result = await ctrl.sendMessage("hello")
    expect(result.success).toBe(true)

    vi.restoreAllMocks()

    // The raw AgentTurn stored via appendAiTurn has steps
    const appendedTurn = storage._appendedTurns[0]
    const modelStep = appendedTurn.steps.find((s: any) => s.type === "model_response")
    expect(modelStep).toBeDefined()
    expect(modelStep.reasoning).toContain("let me think")
    // reasoningDurationMs must be positive: reasoning delta fired before content delta,
    // so reasoningEndedAt > reasoningStartedAt (each Date.now() call advances by 10ms)
    expect(modelStep.reasoningDurationMs).toBeGreaterThan(0)

    // The renderer snapshot (via getCurrentSession) should have segments
    const session = await ctrl.getCurrentSession()
    const snapshot = session.turns[0]
    expect(snapshot.segments).toBeDefined()
    const reasoningSegment = snapshot.segments!.find((s: any) => s.kind === "reasoning")
    expect(reasoningSegment).toBeDefined()
    expect(reasoningSegment!.text).toContain("let me think")
    // durationMs on the segment is derived from reasoningDurationMs on the step
    expect(reasoningSegment!.durationMs).toBeGreaterThan(0)
  })

  it("strips reasoning_content from conversation history", async () => {
    const storage = makeStorage()
    const ctrl = new AIController(storage as any)
    await ctrl.init()
    const localClient = (ctrl as any).localClient

    const messageWithReasoning = {
      role: "assistant",
      content: "",
      reasoning_content: "private thinking",
      tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "ok"}}}],
    }
    vi.spyOn(localClient, "chat").mockImplementation(makeStreamingMock([], messageWithReasoning))

    await ctrl.sendMessage("hi")
    const history = (ctrl as any).conversationHistory
    const assistantEntries = history.filter((m: any) => m.role === "assistant")
    for (const e of assistantEntries) {
      expect(e.reasoning_content).toBeUndefined()
    }
  })

  it("snapshot interleaves reasoning + tool segments in temporal order", async () => {
    const storage = makeStorage()
    const ctrl = new AIController(storage as any)
    await ctrl.init()
    const localClient = (ctrl as any).localClient

    const callCounter = {n: 0}
    vi.spyOn(localClient, "chat").mockImplementation(async (_m, _t, _s, _tc, callbacks) => {
      callCounter.n++
      if (callCounter.n === 1) {
        callbacks?.onDelta?.({kind: "reasoning", text: "first thought"})
        return {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{id: "c1", type: "function", function: {name: "list_tasks", arguments: {date: "2026-06-05"}}}],
          },
          done: true,
        }
      }
      callbacks?.onDelta?.({kind: "reasoning", text: "now respond"})
      return {
        message: {role: "assistant", content: "", tool_calls: [{id: "c2", type: "function", function: {name: "respond", arguments: {text: "done"}}}]},
        done: true,
      }
    })

    // Mock the executor to make list_tasks succeed
    const executor = (ctrl as any).executor
    vi.spyOn(executor, "execute").mockResolvedValue({success: true, summary: "5 tasks"})

    await ctrl.sendMessage("show tasks")

    // Get the renderer snapshot via getCurrentSession (runs through turnToSnapshot)
    const session = await ctrl.getCurrentSession()
    const snapshot = session.turns[0]
    const kinds = snapshot.segments!.map((s: any) => s.kind)
    expect(kinds).toEqual(["reasoning", "tool", "reasoning"])
  })
})
