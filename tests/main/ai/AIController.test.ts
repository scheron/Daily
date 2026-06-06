// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"
import {createPolicyHook} from "@main/ai/policy/policyHook"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeStorage(enabled = true): any {
  return {
    loadSettings: vi.fn(async () => ({
      ai: enabled ? {enabled: true, provider: "openai", openai: {model: "gpt-4o"}} : {enabled: false},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

function withScriptedLLM(ctrl: AIController, responses: any[]) {
  let i = 0
  vi.spyOn(ctrl as any, "callLLM").mockImplementation(async () => {
    const r = responses[i++]
    if (!r) throw new Error(`Script exhausted at step ${i}`)
    if (r.throws) throw r.throws
    return {message: r, done: false}
  })
}

describe("AIController.sendMessage", () => {
  let ctrl: AIController

  beforeEach(async () => {
    ctrl = new AIController(makeStorage())
    await ctrl.updateConfig({enabled: true, provider: "openai", openai: {model: "gpt-4o", apiKey: "x"}})
  })

  it("returns success on a no-tool response", async () => {
    withScriptedLLM(ctrl, [{role: "assistant", content: "Hello there."}])
    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(true)
    expect(r.message?.content).toBe("Hello there.")
  })

  it("rolls history back to start on model error", async () => {
    withScriptedLLM(ctrl, [{throws: new Error("model boom")}])
    const before = (ctrl as any).conversationHistory.length
    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(false)
    expect((ctrl as any).conversationHistory.length).toBe(before)
  })

  it("rolls history back on cancel and returns 'Request cancelled'", async () => {
    withScriptedLLM(ctrl, [{throws: Object.assign(new Error("aborted"), {name: "AbortError"})}])
    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(false)
    expect(r.error).toBe("Request cancelled")
    expect((ctrl as any).conversationHistory).toHaveLength(0)
  })

  it("rejects a concurrent sendMessage with a clear error", async () => {
    vi.spyOn(ctrl as any, "callLLM").mockImplementation(() => new Promise(() => {}))
    const first = ctrl.sendMessage("first")
    await new Promise((r) => setImmediate(r))
    const second = await ctrl.sendMessage("second")
    expect(second.success).toBe(false)
    expect(second.error).toMatch(/already processing/i)
    void first
  })

  it("clears abortController in finally", async () => {
    withScriptedLLM(ctrl, [{role: "assistant", content: "ok"}])
    await ctrl.sendMessage("hi")
    expect((ctrl as any).abortController).toBeNull()
  })

  it("invokes TransformContextHook before each LLM call", async () => {
    const transform = vi.fn((msgs) => msgs)
    ctrl.getHooks().registerTransformContext(transform)
    withScriptedLLM(ctrl, [{role: "assistant", content: "ok"}])
    await ctrl.sendMessage("hi")
    expect(transform).toHaveBeenCalledOnce()
  })

  it("invokes BeforeToolCallHook for each tool call and AfterToolCallHook with the result", async () => {
    const before = vi.fn(async () => ({action: "pass"}))
    const after = vi.fn(async () => {})
    ctrl.getHooks().registerBeforeToolCall(before)
    ctrl.getHooks().registerAfterToolCall(after)

    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "ok"})
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "list_tasks", arguments: "{}"}}],
      },
      {role: "assistant", content: "Done."},
    ])

    await ctrl.sendMessage("show me tasks")
    expect(before).toHaveBeenCalledOnce()
    expect(after).toHaveBeenCalledOnce()
  })

  it("skip decision from BeforeToolCallHook prevents tool execution", async () => {
    const executor = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    ctrl.getHooks().registerBeforeToolCall(async () => ({action: "skip", reason: "blocked by policy"}))
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: "{}"}}],
      },
      {role: "assistant", content: "Couldn't do it."},
    ])

    await ctrl.sendMessage("delete it")
    expect(executor).not.toHaveBeenCalled()
  })

  // ===== Phase 3: tool policy + confirmations =====

  async function settle() {
    // Two microtask flushes are enough for the policy hook to register the
    // pending confirmation after the LLM script yields a destructive tool call.
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
  }

  // The policy hook is registered lazily by init(); the tests above construct
  // the controller without going through init(), so we register it manually.
  function attachPolicy(target: AIController = ctrl) {
    target.getHooks().registerBeforeToolCall(createPolicyHook(target as any))
  }

  // Spying on callLLM bypasses currentToolSchemas population, which makes
  // validateToolArguments reject every tool call as "not available for this
  // model tier". For tests that need the executor to actually fire, stub the
  // schemas directly.
  function stubSchemas(target: AIController = ctrl) {
    ;(target as any).currentToolSchemas = new Map([
      ["delete_task", {type: "object", properties: {task_id: {type: "string"}}, required: ["task_id"]}],
      ["list_tasks", {type: "object", properties: {}, required: []}],
    ])
  }

  it("confirming a pending destructive tool causes it to execute", async () => {
    attachPolicy()
    stubSchemas()
    const executor = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "deleted"})
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "abc"}}}],
      },
      {role: "assistant", content: "Done."},
    ])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()

    const pending = (ctrl as any).pendingConfirmation
    expect(pending).toBeTruthy()
    expect(pending.toolName).toBe("delete_task")

    const ok = ctrl.confirmToolCall(pending.id)
    expect(ok).toBe(true)

    const r = await sendPromise
    expect(r.success).toBe(true)
    expect(executor).toHaveBeenCalledOnce()
  })

  it("cancelling a pending destructive tool prevents execution", async () => {
    attachPolicy()
    stubSchemas()
    const executor = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "deleted"})
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "abc"}}}],
      },
      {role: "assistant", content: "Skipped."},
    ])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()

    const pending = (ctrl as any).pendingConfirmation
    expect(pending).toBeTruthy()
    const ok = ctrl.cancelToolCall(pending.id)
    expect(ok).toBe(true)

    const r = await sendPromise
    expect(r.success).toBe(true)
    expect(executor).not.toHaveBeenCalled()
  })

  it("global cancel() resolves a pending confirmation as cancelled", async () => {
    attachPolicy()
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "abc"}}}],
      },
      // After the skip, the loop runs another LLM iteration which will throw because cancel() also aborted.
      {throws: Object.assign(new Error("aborted"), {name: "AbortError"})},
    ])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()

    expect((ctrl as any).pendingConfirmation).toBeTruthy()
    ctrl.cancel()

    const r = await sendPromise
    expect(r.success).toBe(false)
    expect((ctrl as any).pendingConfirmation).toBeNull()
  })

  it("confirmToolCall with wrong id returns false and does not resolve", async () => {
    attachPolicy()
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    withScriptedLLM(ctrl, [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "abc"}}}],
      },
      {role: "assistant", content: "Done."},
    ])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()

    expect(ctrl.confirmToolCall("wrong-id")).toBe(false)
    const pending = (ctrl as any).pendingConfirmation
    expect(pending).toBeTruthy()
    // Now confirm with the right id to let the turn finish.
    ctrl.confirmToolCall(pending.id)
    await sendPromise
  })

  // ===== Phase 4: tool_choice required + respond + turn model =====

  it("calls the LLM with tool_choice 'required' on every iteration", async () => {
    const chatSpy = vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Hi."}}}],
      },
      done: true,
    })
    await ctrl.sendMessage("hi")
    expect(chatSpy).toHaveBeenCalled()
    const args = chatSpy.mock.calls[0]
    expect(args[3]).toBe("required")
  })

  it("falls back to tool_choice 'auto' for remote thinking models that reject 'required'", async () => {
    // DeepSeek thinking-mode models (deepseek-reasoner, deepseek-v4-flash,
    // OpenAI o-series, QwQ) return HTTP 400 on tool_choice='required'.
    for (const model of ["deepseek-reasoner", "deepseek-v4-flash", "o3-mini", "qwq-32b"]) {
      const storage: any = {
        loadSettings: vi.fn(async () => ({
          ai: {enabled: true, provider: "openai", openai: {model, apiKey: "x"}},
          branch: {activeId: "main"},
        })),
        saveSettings: vi.fn(async () => {}),
        appendAiTurn: vi.fn(async () => {}),
        archiveActiveAiSession: vi.fn(async () => false),
        getActiveAiSessionTurns: vi.fn(async () => []),
      }
      const fresh = new AIController(storage)
      await fresh.updateConfig({enabled: true, provider: "openai", openai: {model, apiKey: "x"}})
      const chatSpy = vi.spyOn((fresh as any).openaiClient, "chat").mockResolvedValue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Hi."}}}],
        },
        done: true,
      })
      await fresh.sendMessage("hi")
      expect(chatSpy.mock.calls[0][3]).toBe("auto")
    }
  })

  it("treats respond() as the final message and skips hook/executor for it", async () => {
    const beforeHook = vi.fn(async () => ({action: "pass"}))
    ctrl.getHooks().registerBeforeToolCall(beforeHook)
    const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Done."}}}],
      },
      done: true,
    })

    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(true)
    expect(r.message?.content).toBe("Done.")
    expect(beforeHook).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
  })

  it("uses plain assistant.content as fallback when respond is never called", async () => {
    vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
      message: {role: "assistant", content: "I forgot to use respond."},
      done: true,
    })
    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(true)
    expect(r.message?.content).toContain("forgot")
  })

  it("persists the turn on success via storage.appendAiTurn", async () => {
    vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Hi."}}}],
      },
      done: true,
    })
    await ctrl.sendMessage("hi")
    const storage = (ctrl as any).storage
    expect(storage.appendAiTurn).toHaveBeenCalledOnce()
    const [persistedTurn, meta] = storage.appendAiTurn.mock.calls[0]
    expect(persistedTurn.status).toBe("completed")
    expect(persistedTurn.finalMessage).toBe("Hi.")
    expect(meta).toMatchObject({provider: "openai"})
  })

  it("persists the turn on failure as 'failed' status", async () => {
    vi.spyOn((ctrl as any).openaiClient, "chat").mockRejectedValueOnce(new Error("network boom"))
    await ctrl.sendMessage("hi")
    const storage = (ctrl as any).storage
    expect(storage.appendAiTurn).toHaveBeenCalledOnce()
    const [persistedTurn] = storage.appendAiTurn.mock.calls[0]
    expect(persistedTurn.status).toBe("failed")
    expect(persistedTurn.error).toContain("network boom")
  })

  it("emits live AIEvents in order for a respond-only turn", async () => {
    const events: any[] = []
    const ctrl3 = new AIController(makeStorage(), undefined, undefined, (e) => events.push(e))
    await ctrl3.updateConfig({enabled: true, provider: "openai", openai: {model: "gpt-4o", apiKey: "x"}})
    vi.spyOn((ctrl3 as any).openaiClient, "chat").mockResolvedValue({
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Hi."}}}],
      },
      done: true,
    })
    await ctrl3.sendMessage("hi")
    const types = events.map((e) => e.type)
    expect(types[0]).toBe("turn_started")
    expect(types).toContain("model_requested")
    expect(types).toContain("model_responded")
    expect(types[types.length - 1]).toBe("turn_finished")
  })

  it("emits tool_started/tool_finished around a tool call", async () => {
    const events: any[] = []
    const ctrl3 = new AIController(makeStorage(), undefined, undefined, (e) => events.push(e))
    await ctrl3.updateConfig({enabled: true, provider: "openai", openai: {model: "gpt-4o", apiKey: "x"}})
    ;(ctrl3 as any).currentToolSchemas = new Map([["create_task", {type: "object", properties: {content: {type: "string"}}, required: ["content"]}]])
    vi.spyOn((ctrl3 as any).executor, "execute").mockResolvedValue({success: true, data: "Task created"})

    let i = 0
    const script = [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c1", type: "function", function: {name: "create_task", arguments: {content: "x"}}}],
        },
        done: true,
      },
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c2", type: "function", function: {name: "respond", arguments: {text: "Done."}}}],
        },
        done: true,
      },
    ]
    vi.spyOn((ctrl3 as any).openaiClient, "chat").mockImplementation(async () => script[i++])

    await ctrl3.sendMessage("make x")
    const types = events.map((e) => e.type)
    expect(types).toContain("tool_started")
    expect(types).toContain("tool_finished")
    const finished = events.find((e) => e.type === "tool_finished")
    expect(finished.toolName).toBe("create_task")
    expect(finished.success).toBe(true)
  })

  it("archives the active session on clearHistory", async () => {
    await ctrl.clearHistory()
    const storage = (ctrl as any).storage
    expect(storage.archiveActiveAiSession).toHaveBeenCalledOnce()
  })

  it("processes a write tool then respond in two iterations", async () => {
    ;(ctrl as any).currentToolSchemas = new Map([["create_task", {type: "object", properties: {content: {type: "string"}}, required: ["content"]}]])
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "Task created: x"})

    let i = 0
    const responses = [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c1", type: "function", function: {name: "create_task", arguments: {content: "x"}}}],
        },
        done: true,
      },
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c2", type: "function", function: {name: "respond", arguments: {text: "Created."}}}],
        },
        done: true,
      },
    ]
    vi.spyOn((ctrl as any).openaiClient, "chat").mockImplementation(async () => responses[i++])

    const r = await ctrl.sendMessage("make task x")
    expect(r.success).toBe(true)
    expect(r.message?.content).toBe("Created.")
    expect(r.message?.toolCalls?.map((t) => t.name)).toEqual(["create_task"])
  })

  // ===== existing Phase 3 broadcaster test =====

  it("broadcastConfirmation receives 'required' on suspend and 'resolved' on answer", async () => {
    const broadcast = vi.fn()
    const ctrl2 = new AIController(makeStorage(), undefined, broadcast)
    await ctrl2.updateConfig({enabled: true, provider: "openai", openai: {model: "gpt-4o", apiKey: "x"}})
    attachPolicy(ctrl2)

    vi.spyOn((ctrl2 as any).executor, "execute").mockResolvedValue({success: true})
    let i = 0
    const script = [
      {
        role: "assistant",
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "abc"}}}],
      },
      {role: "assistant", content: "Done."},
    ]
    vi.spyOn(ctrl2 as any, "callLLM").mockImplementation(async () => ({message: script[i++], done: false}))

    const sendPromise = ctrl2.sendMessage("delete it")
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))

    const required = broadcast.mock.calls.find((c) => c[0]?.type === "required")
    expect(required).toBeTruthy()
    expect(required[0].confirmation.toolName).toBe("delete_task")

    ctrl2.confirmToolCall(required[0].confirmation.id)
    await sendPromise

    const resolved = broadcast.mock.calls.find((c) => c[0]?.type === "resolved")
    expect(resolved).toBeTruthy()
  })
})
