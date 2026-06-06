# Phase 1 + Hook Architecture Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Daily's AI turn loop concurrency-safe (mutex + snapshot rollback + scoped cancel), and introduce the hook chain that subsequent phases (Phase 3 policy, Phase 8 compaction, Phase 4 respond invariant) plug into.

**Architecture:** Replace the unguarded `sendMessage` body with `AsyncMutex.tryLock()` rejection of concurrent calls, snapshot the conversation history at turn start and restore it on error/cancel, move `abortController` cleanup into `finally`. Introduce a `HookChain` owned by `AIController` with three hook types (`BeforeToolCallHook`, `AfterToolCallHook`, `TransformContextHook`); the loop calls into the chain at three points (before LLM call, before tool exec, after tool exec). No concrete hooks are registered in this phase — that's Phase 3+ work.

**Tech Stack:** TypeScript, existing `AsyncMutex` from `src/main/utils/AsyncMutex.ts`, no new dependencies.

**Spec source:** [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 1 + "Hook Architecture" sections, revised 2026-06-06.

---

## Conventions

- **TDD** for the AIController test file (new). Hook chain itself is trivial composition; minimal unit test.
- **Commit per task.** Most tasks here are surgical edits to one file, so one commit per task is sized right.
- **Test command:** `pnpm evitest run tests/main/<path>` for one file, `pnpm test:main` for the suite. Never `pnpm vitest` directly.
- **Path aliases:** `@/` → `src/main/`, `@shared/` → `src/shared/`, `@main/` → `src/main/` in tests.

---

## File Structure (target)

```
src/main/ai/
  hooks/
    types.ts                       — BeforeToolCallHook, AfterToolCallHook,
                                     TransformContextHook, AgentContext,
                                     BeforeToolCallDecision
    HookChain.ts                   — class with register*/run* methods
  AIController.ts                  — modified: AsyncMutex + snapshot rollback +
                                     hook chain wiring + scoped cancel

tests/main/ai/
  hooks/
    HookChain.test.ts              — unit tests for chain composition
  AIController.test.ts             — behavior tests: success, fail, cancel,
                                     concurrent, hook invocation
```

`tests/main/ai/` currently exists but is empty.

---

## Task 0: Hook types

**Files:**

- Create: `src/main/ai/hooks/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM, ToolCallLLM} from "@/ai/types"

/**
 * Minimal turn shape available to hooks. Phase 4 will expand this when the
 * Turn entity lands — for now hooks see the user message and the live
 * conversation prefix.
 */
export type AgentContext = {
  turnId: string
  userMessage: string
  startedAt: number
  /** Live snapshot of conversation history at the moment the hook fires. */
  messages: ReadonlyArray<MessageLLM>
}

export type BeforeToolCallDecision = {action: "pass"} | {action: "skip"; reason: string}

/**
 * Runs before each tool call. May skip the tool — when "skip" is returned,
 * the loop synthesizes a ToolResult with `success: false, error: reason` and
 * feeds it to the model as if the tool itself had refused.
 *
 * Phase 3's policy hook returns "skip" when a destructive tool needs
 * confirmation that has not yet been granted.
 */
export type BeforeToolCallHook = (ctx: AgentContext, call: ToolCallLLM) => Promise<BeforeToolCallDecision>

/**
 * Runs after each tool call (whether it ran or was skipped). Used for
 * logging, metrics, quota counters. Cannot influence the loop.
 */
export type AfterToolCallHook = (ctx: AgentContext, call: ToolCallLLM, result: ToolResult) => Promise<void>

/**
 * Transforms the conversation prefix before it is sent to the LLM. Applied
 * in registration order. Phase 8's compactor replaces old turns with a
 * summary using this hook.
 */
export type TransformContextHook = (messages: ReadonlyArray<MessageLLM>) => ReadonlyArray<MessageLLM>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:main`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/hooks/types.ts
git commit -m "feat: define hook chain types for AI agent runtime"
```

---

## Task 1: HookChain class

**Files:**

- Create: `src/main/ai/hooks/HookChain.ts`
- Test: `tests/main/ai/hooks/HookChain.test.ts`

- [ ] **Step 1: Write tests first**

```ts
// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {HookChain} from "@main/ai/hooks/HookChain"

const ctx = {turnId: "t1", userMessage: "hi", startedAt: 0, messages: []} as any

describe("HookChain", () => {
  it("runBeforeToolCall returns pass when no hooks registered", async () => {
    const chain = new HookChain()
    const r = await chain.runBeforeToolCall(ctx, {} as any)
    expect(r).toEqual({action: "pass"})
  })

  it("runBeforeToolCall calls hooks in registration order until one skips", async () => {
    const chain = new HookChain()
    const h1 = vi.fn(async () => ({action: "pass"}))
    const h2 = vi.fn(async () => ({action: "skip", reason: "blocked"}))
    const h3 = vi.fn(async () => ({action: "pass"}))
    chain.registerBeforeToolCall(h1)
    chain.registerBeforeToolCall(h2)
    chain.registerBeforeToolCall(h3)

    const r = await chain.runBeforeToolCall(ctx, {} as any)
    expect(r).toEqual({action: "skip", reason: "blocked"})
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
    expect(h3).not.toHaveBeenCalled()
  })

  it("runAfterToolCall calls every registered hook", async () => {
    const chain = new HookChain()
    const h1 = vi.fn(async () => {})
    const h2 = vi.fn(async () => {})
    chain.registerAfterToolCall(h1)
    chain.registerAfterToolCall(h2)

    await chain.runAfterToolCall(ctx, {} as any, {success: true})
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it("runTransformContext threads result through all hooks", () => {
    const chain = new HookChain()
    chain.registerTransformContext((msgs) => [...msgs, {role: "system", content: "h1"} as any])
    chain.registerTransformContext((msgs) => [...msgs, {role: "system", content: "h2"} as any])

    const out = chain.runTransformContext([{role: "user", content: "hi"}] as any)
    expect(out).toHaveLength(3)
    expect((out[1] as any).content).toBe("h1")
    expect((out[2] as any).content).toBe("h2")
  })

  it("runTransformContext returns messages unchanged with no hooks", () => {
    const chain = new HookChain()
    const input = [{role: "user", content: "hi"}] as any
    expect(chain.runTransformContext(input)).toBe(input)
  })
})
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm evitest run tests/main/ai/hooks/HookChain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `HookChain.ts`**

```ts
import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM, ToolCallLLM} from "@/ai/types"
import type {AfterToolCallHook, AgentContext, BeforeToolCallDecision, BeforeToolCallHook, TransformContextHook} from "./types"

export class HookChain {
  private before: BeforeToolCallHook[] = []
  private after: AfterToolCallHook[] = []
  private transform: TransformContextHook[] = []

  registerBeforeToolCall(hook: BeforeToolCallHook): void {
    this.before.push(hook)
  }

  registerAfterToolCall(hook: AfterToolCallHook): void {
    this.after.push(hook)
  }

  registerTransformContext(hook: TransformContextHook): void {
    this.transform.push(hook)
  }

  async runBeforeToolCall(ctx: AgentContext, call: ToolCallLLM): Promise<BeforeToolCallDecision> {
    for (const hook of this.before) {
      const decision = await hook(ctx, call)
      if (decision.action === "skip") return decision
    }
    return {action: "pass"}
  }

  async runAfterToolCall(ctx: AgentContext, call: ToolCallLLM, result: ToolResult): Promise<void> {
    for (const hook of this.after) {
      await hook(ctx, call, result)
    }
  }

  runTransformContext(messages: ReadonlyArray<MessageLLM>): ReadonlyArray<MessageLLM> {
    if (this.transform.length === 0) return messages
    return this.transform.reduce<ReadonlyArray<MessageLLM>>((acc, hook) => hook(acc), messages)
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/ai/hooks/HookChain.test.ts`
Expected: PASS — 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/hooks/HookChain.ts tests/main/ai/hooks/HookChain.test.ts
git commit -m "feat: add HookChain for composing AI agent runtime hooks"
```

---

## Task 2: Rewrite `sendMessage` — mutex + snapshot rollback + cancel cleanup + hook wiring

**Files:**

- Modify: `src/main/ai/AIController.ts`
- Test: `tests/main/ai/AIController.test.ts` (new)

This is the bulk of the work. All four concerns touch the same method, so one commit is right-sized.

### What changes

1. **Concurrency guard:** `tryLock()` from `AsyncMutex` at the top of `sendMessage`. On lock-busy, return `{success: false, error: "AI assistant is already processing a message"}`. On lock-acquired, hold the release function until `finally` runs.

2. **Snapshot rollback:** record `const historyStartIndex = this.conversationHistory.length` immediately after acquiring the lock. On any error path (model error, cancel), restore via `this.conversationHistory.length = historyStartIndex`. Delete the lone `this.conversationHistory.pop()` at line 212.

3. **Cancel cleanup:** `cancel()` only calls `this.abortController?.abort()`. It does NOT null the controller — that happens in the `sendMessage`'s `finally`. The current synchronous null at `cancel()` is the bug.

4. **Hook wiring:**
   - Add `private hooks = new HookChain()` to the class (exposed via a getter for future Phase 3+ registration).
   - Inside the loop, before the LLM call: `const projectedMessages = this.hooks.runTransformContext(messages)`. Use `projectedMessages` for the actual `callLLM`.
   - When processing tool calls: for each call, `const decision = await this.hooks.runBeforeToolCall(ctx, call)`. If `decision.action === "skip"`, synthesize `{success: false, error: decision.reason}` instead of calling the executor.
   - After each tool execution (or skip), `await this.hooks.runAfterToolCall(ctx, call, result)`.
   - The `ctx: AgentContext` is built once at the top of `sendMessage` (turnId from `nanoid()` or similar; userMessage; startedAt; messages updated each iteration).

### Step 1: Write the AIController test file

Create `tests/main/ai/AIController.test.ts`:

```ts
// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

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
    // Make the first call hang
    vi.spyOn(ctrl as any, "callLLM").mockImplementation(() => new Promise(() => {}))
    const first = ctrl.sendMessage("first") // never resolves
    // Give the lock a microtask to acquire
    await new Promise((r) => setImmediate(r))
    const second = await ctrl.sendMessage("second")
    expect(second.success).toBe(false)
    expect(second.error).toMatch(/already processing/i)
    // Don't await first — it's stuck by design
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

    // Stub the executor too
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
})
```

### Step 2: Run tests, confirm fail

Run: `pnpm evitest run tests/main/ai/AIController.test.ts`
Expected: most fail (because the new behavior is not implemented yet — `getHooks` doesn't exist, mutex doesn't reject, snapshot rollback doesn't restore, etc.). Note which fail and how.

### Step 3: Modify `AIController.ts`

The diff is involved. Apply these edits in order:

**3a. New imports near the top:**

```ts
import {nanoid} from "nanoid"

import {AsyncMutex} from "@/utils/AsyncMutex"

import {HookChain} from "@/ai/hooks/HookChain"

import type {AgentContext} from "@/ai/hooks/types"
```

**3b. New fields on the class:**

```ts
private sendMutex = new AsyncMutex()
private hooks = new HookChain()
```

**3c. New getter so tests / future phases can register hooks:**

```ts
getHooks(): HookChain {
  return this.hooks
}
```

**3d. Rewrite `cancel()`:**

```ts
cancel(): boolean {
  this.abortController?.abort()
  return true
}
```

(Note: no longer nulls `abortController`. The `finally` in `sendMessage` does that.)

**3e. Rewrite `sendMessage`. The new shape:**

```ts
async sendMessage(userMessage: string): Promise<AIResponse> {
  if (!this.executor) return {success: false, error: "Storage not initialized"}

  const release = this.sendMutex.tryLock()
  if (!release) {
    return {success: false, error: "AI assistant is already processing a message"}
  }

  const config = (await this.storage.loadSettings()).ai
  if (!config?.enabled) {
    release()
    return {success: false, error: "AI assistant is disabled"}
  }

  logger.info(logger.CONTEXT.AI, "Processing message", {messageLength: userMessage.length, provider: config.provider})

  const historyStartIndex = this.conversationHistory.length
  this.abortController = new AbortController()

  const ctx: AgentContext = {
    turnId: nanoid(),
    userMessage,
    startedAt: Date.now(),
    messages: this.conversationHistory,
  }

  try {
    this.conversationHistory.push({role: "user", content: userMessage})

    const toolCalls: Array<{name: string; result: string}> = []
    let finalContent = ""
    let requireVisibleFinalAnswer = false

    let iterations = 0
    const maxIterations = 10
    const promptTier = this.resolvePromptTier(config)
    const systemPrompt = this.getSystemPromptByTier(promptTier)

    while (iterations < maxIterations) {
      iterations++

      const baseMessages: MessageLLM[] = [
        {role: "system", content: systemPrompt},
        ...(requireVisibleFinalAnswer
          ? [
              {
                role: "system" as const,
                content:
                  "Your previous output had no user-visible answer. Return a concise final answer only. Do not include reasoning labels like Thought/Action/Observation.",
              },
            ]
          : []),
        ...this.conversationHistory,
      ]

      const messages = [...this.hooks.runTransformContext(baseMessages)]

      const response = await this.callLLM(messages, promptTier)
      const assistantMessage = response.message

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
        requireVisibleFinalAnswer = false
        this.conversationHistory.push(assistantMessage)

        for (const toolCall of assistantMessage.tool_calls) {
          const decision = await this.hooks.runBeforeToolCall(ctx, toolCall)
          let toolResultStruct: {success: boolean; data?: string; error?: string}

          if (decision.action === "skip") {
            toolResultStruct = {success: false, error: decision.reason}
          } else {
            toolResultStruct = await this.executeToolCall(toolCall)
          }

          await this.hooks.runAfterToolCall(ctx, toolCall, toolResultStruct as ToolResult)

          toolCalls.push({name: toolCall.function.name, result: toolResultStruct.data?.toString() || toolResultStruct.error || "Done"})
          this.conversationHistory.push({role: "tool", content: JSON.stringify(toolResultStruct), tool_call_id: toolCall.id})
        }
      } else {
        const rawContent = assistantMessage.content ?? ""
        finalContent = filterThinkBlocks(rawContent)

        if (!finalContent && iterations < maxIterations) {
          requireVisibleFinalAnswer = true
          this.conversationHistory.push({role: "assistant", content: rawContent})
          continue
        }

        if (!finalContent) finalContent = "I completed the request, but could not produce a visible final response."
        this.conversationHistory.push({role: "assistant", content: finalContent})
        break
      }
    }

    if (!finalContent) {
      finalContent = "I completed the request, but could not produce a visible final response."
    }

    const responseMessage: AIMessage = {
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: finalContent,
      timestamp: Date.now(),
      toolCalls: toolCalls.length ? toolCalls : [],
    }

    logger.info(logger.CONTEXT.AI, "Message processed", {iterations, toolCallsCount: toolCalls.length, responseLength: finalContent.length})

    return {success: true, message: responseMessage}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Snapshot rollback (replaces the old pop())
    this.conversationHistory.length = historyStartIndex

    if (error instanceof Error && error.name === "AbortError") {
      return {success: false, error: "Request cancelled"}
    }

    logger.error(logger.CONTEXT.AI, "Failed to process message", error)
    return {success: false, error: message}
  } finally {
    this.abortController = null
    release()
  }
}
```

**Key delta from current code:**

- Mutex acquired at top via `tryLock`; reject if busy; released in `finally`.
- `historyStartIndex` recorded after lock acquired, restored in `catch`.
- `this.conversationHistory.pop()` REMOVED — snapshot restore replaces it.
- `this.abortController = null` moved to `finally`.
- `ctx: AgentContext` built once.
- `baseMessages` → transformed via `hooks.runTransformContext` → `messages` (spread back into mutable array, because callLLM signature uses `MessageLLM[]`).
- Tool loop: `decision = await hooks.runBeforeToolCall(...)` before `executeToolCall`. If skip, synthesize result. Then `hooks.runAfterToolCall(...)` regardless.
- The `requireVisibleFinalAnswer` workaround is preserved as-is — that's Phase 4 (respond tool + tool_choice required) territory.

### Step 4: Run tests, confirm pass

Run: `pnpm evitest run tests/main/ai/AIController.test.ts`
Expected: PASS — 8 cases.

Run: `pnpm test:main`
Expected: full main suite green. The hook chain is empty in production code paths, so the existing AI behavior is unchanged.

### Step 5: Commit

```bash
git add src/main/ai/AIController.ts \
        tests/main/ai/AIController.test.ts
git commit -m "feat: stabilize AI turn loop with mutex, snapshot rollback, hook chain"
```

---

## Task 3: Full-suite gate

- [ ] `pnpm lint` — clean.
- [ ] `pnpm typecheck:all` — zero errors across main / render / shared.
- [ ] `pnpm test` — all tests pass. New test counts:
  - HookChain.test.ts: +5
  - AIController.test.ts: +8
  - Expected total ~407 (was 394 after Phase 2 + refactor).
- [ ] `pnpm circular` — no new circular deps.
- [ ] Manual smoke: `pnpm dev`, send a message to the in-app AI assistant, verify it still works end-to-end. Then double-tap send to force concurrent — second attempt should error with "already processing" rather than corrupting state.

If any gate fails, fix and amend the relevant commit.

---

## Self-Review Notes

**Spec coverage** (against [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) Phase 1 + Hook Architecture):

- "No path uses `conversationHistory.pop()` for rollback" → Task 2 (snapshot restore).
- "Two concurrent IPC `ai:send-message` calls cannot interleave one shared history" → Task 2 (tryLock).
- "Cancelled requests leave no partial assistant/tool messages in history" → Task 2 (snapshot restore covers cancel path too).
- "Tests cover success, failure, cancel, and concurrency behavior" → Task 2 (AIController.test.ts).
- Hook chain types (`BeforeToolCallHook`, `AfterToolCallHook`, `TransformContextHook`) and class → Tasks 0-1.
- Loop calls hook chain at three points → Task 2.

**Out of scope** (deliberately):

- Concrete hook implementations (policy, compaction, etc.) — Phases 3/8.
- `tool_choice: "required"` + `respond` tool — Phase 4.
- Deleting the `requireVisibleFinalAnswer` workaround — Phase 4.
- Turn entity (`AgentTurn`, `AgentStep`) — Phase 4.
- Durable session persistence — Phase 5.

**Risk hotspots:**

- The mutex/cancel interaction. If a turn is cancelled mid-flight, the in-flight Promise still holds the lock until `finally` runs and `release()` fires. That should be quick (a few microtasks). Verified by the "rejects concurrent" test which uses a hanging first call — second call rejects immediately. The "rolls history back on cancel" test exercises the abort path.
- The hook context `ctx.messages` is a reference to the LIVE `conversationHistory`. Hooks see a moving target. This is intentional for Phase 3 — the policy hook wants to see what's already happened. If hooks need a frozen snapshot, they can `[...ctx.messages]` themselves.
- `runTransformContext` returns `ReadonlyArray<MessageLLM>` but `callLLM` signature accepts `MessageLLM[]`. We spread back into a mutable array — minor inefficiency, but clearer than weakening the readonly contract.
- The `executeToolCall` private method's signature was `{success, data?, error?}`, not `ToolResult`. Inside the loop after Task 2, we still call it but also synthesize compatible shapes for skipped calls. The `hooks.runAfterToolCall` accepts `ToolResult` — cast is fine because shapes overlap structurally.
