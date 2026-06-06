# Phase 4 — Turn Model + `tool_choice: "required"` + `respond` Tool

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Kill the "said done but didn't do anything" failure class by construction. The model can no longer return plain `assistant.content` as a final answer — every user-visible message must flow through an explicit `respond({text})` tool. `tool_choice: "required"` enforces it at the provider level. The `requireVisibleFinalAnswer` workaround in `AIController.sendMessage` is deleted. At the same time, introduce a minimal `AgentTurn` / `AgentStep` model that records every model response, tool call, tool result, and confirmation event for the current turn — making rollback, retry, debugging, and Phase 5 persistence trivial.

**Architecture:**

1. **`tool_choice` plumbing.** `IAiClient.chat()` gains a `toolChoice?: "auto" | "required"` parameter. `OpenAiCompatibleClient` forwards it to the OpenAI-compatible `tool_choice` field on `ChatRequest`. Default in production is `"required"`. Local models that ignore it degrade gracefully (we fall back to plain content if `respond` was never called).
2. **`respond` tool.** New `RegisteredTool` with `name: "respond"`, single param `text: string`, `isWrite: false`, `isDestructive: false`. The loop SPECIAL-CASES this tool — it does NOT fire hooks, does NOT call the executor; instead it captures the text as the turn's final message and breaks. A synthesized tool result is still appended to history so the message log stays well-formed.
3. **`AgentTurn` + `AgentStep`.** In-memory only (Phase 5 persists). `TurnBuilder` appends a step per model response / tool call / tool result / confirmation request / error. `AIController.sendMessage` creates one turn per call and discards on failure (snapshot rollback still applies).
4. **Loop changes.** Every iteration calls the LLM with `toolChoice: "required"`. Each `respond` call ends the turn. If the model returns plain content without any tool calls (a misbehaving provider), the loop uses that content as a fallback final message (kept for graceful degradation). The `requireVisibleFinalAnswer` retry branch is deleted.
5. **System prompt** picks up a short paragraph telling the model to use `respond` for any user-visible text. Other safety guidance stays.

**Tech Stack:** TypeScript, existing registry, hook chain, AsyncMutex. No new dependencies.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 4 + Chelsea-derived "Required pattern" section.

---

## Conventions

- **TDD** for the `respond` tool unit test + AIController integration tests.
- **Commit per task.** ~6 commits.
- **Test command:** `pnpm evitest run tests/main/<path>` for one file, `pnpm test:main` for the suite.

---

## Task 0: `tool_choice` plumbing through clients

**Files:**

- Modify: `src/main/ai/types.ts` — extend `IAiClient.chat` signature.
- Modify: `src/main/ai/clients/common/types.ts` — add `tool_choice` to `ChatRequest`.
- Modify: `src/main/ai/clients/common/OpenAiCompatibleClient.ts` — accept and forward.

- [ ] **Step 1: Extend types**

```ts
// src/main/ai/types.ts
export type ToolChoice = "auto" | "required" | "none"

export interface IAiClient {
  ...
  chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal, toolChoice?: ToolChoice): Promise<{message: MessageLLM; done: boolean}>
}
```

```ts
// src/main/ai/clients/common/types.ts
export type ChatRequest = {
  model: string
  messages: MessageLLM[]
  tools?: Tool[]
  tool_choice?: "auto" | "required" | "none"
  stream?: boolean
} & ChatSamplingParams
```

```ts
// src/main/ai/clients/common/OpenAiCompatibleClient.ts
async chat(messages, tools?, signal?, toolChoice?) {
  ...
  const requestBody: ChatRequest = {
    model: config.model,
    messages: openAiMessages,
    tools,
    tool_choice: toolChoice,   // ← new
    stream: false,
    ...
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck:main
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/types.ts src/main/ai/clients/common/types.ts src/main/ai/clients/common/OpenAiCompatibleClient.ts
git commit -m "feat: plumb tool_choice through IAiClient.chat and OpenAI-compatible request"
```

---

## Task 1: `respond` tool in the registry

**Files:**

- Create: `src/main/ai/tools/registry/categories/meta/respond.ts`
- Create: `src/main/ai/tools/registry/categories/meta/index.ts`
- Modify: `src/main/ai/tools/registry/index.ts` — include `META_TOOLS`
- Test: extend existing registry test or add `tests/main/ai/tools/registry/metaTools.test.ts`

Why a dedicated `meta` category: the tool isn't a domain operation (not a task/tag/project/file/summary action). It's part of the runtime protocol.

- [ ] **Step 1: Implement**

```ts
// src/main/ai/tools/registry/categories/meta/respond.ts

import type {RegisteredTool} from "../../types"

export const respond: RegisteredTool = {
  name: "respond",
  description:
    "Send a user-visible message. This is the ONLY way to communicate with the user. The text you pass here is exactly what the user sees. " +
    "Call this once when you have finished the request (or when you need to ask the user a question). Do not include reasoning or tool-call traces.",
  parameters: {
    type: "object",
    properties: {
      text: {type: "string", description: "The exact text shown to the user. Plain prose, no labels."},
    },
    required: ["text"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params) {
    const text = typeof params.text === "string" ? params.text : ""
    return {success: true, data: text}
  },
}
```

```ts
// src/main/ai/tools/registry/categories/meta/index.ts
import {respond} from "./respond"

import type {RegisteredTool} from "../../types"

export const META_TOOLS: RegisteredTool[] = [respond]
```

```ts
// src/main/ai/tools/registry/index.ts — add META_TOOLS to REGISTRY
import {META_TOOLS} from "./categories/meta"
...
export const REGISTRY: ReadonlyArray<RegisteredTool> = [
  ...META_TOOLS,
  ...TASK_TOOLS,
  ...TAG_TOOLS,
  ...PROJECT_TOOLS,
  ...FILE_TOOLS,
  ...SUMMARY_TOOLS,
]
```

- [ ] **Step 2: Add a tiny test verifying it's registered**

Add to `tests/main/ai/tools/registry/registry.test.ts`:

```ts
it("includes the respond meta tool", () => {
  const respond = REGISTRY.find((t) => t.name === "respond")
  expect(respond).toBeDefined()
  expect(respond?.isWrite).toBe(false)
  expect(respond?.isDestructive).toBe(false)
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm evitest run tests/main/ai/tools/registry/
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/tools/registry/categories/meta tests/main/ai/tools/registry/registry.test.ts src/main/ai/tools/registry/index.ts
git commit -m "feat: add respond meta tool — the only channel for user-visible messages"
```

---

## Task 2: MCP must filter out `respond`

**Files:**

- Modify: `src/main/mcp/tools/registry.ts` (or `src/main/mcp/constants.ts`) — exclude `respond`.

The MCP server exposes domain tools to external clients. `respond` is a protocol detail of the in-app agent loop and has no meaning for MCP clients — an external client doesn't have a Daily UI to render the response into.

- [ ] **Step 1: Audit current filter**

Read `src/main/mcp/tools/registry.ts` and `src/main/mcp/constants.ts`. If there's a hard-destructive block-list, add `respond` to it OR add a separate "internal protocol" exclusion list.

- [ ] **Step 2: Add a test**

Whichever file ships the MCP-exposed list, add a test that asserts `respond` is NOT in it.

- [ ] **Step 3: Commit**

```bash
git add src/main/mcp/ tests/main/mcp/
git commit -m "feat: hide respond meta tool from MCP — it's an in-app protocol detail"
```

---

## Task 3: Turn model types + `TurnBuilder`

**Files:**

- Create: `src/main/ai/turns/types.ts`
- Create: `src/main/ai/turns/TurnBuilder.ts`
- Test: `tests/main/ai/turns/TurnBuilder.test.ts`

- [ ] **Step 1: Types**

```ts
// src/main/ai/turns/types.ts
import type {ToolResult} from "@/ai/tools/types"
import type {MessageLLM} from "@/ai/types"
import type {PendingToolConfirmation} from "@shared/types/ai"

export type AgentTurnStatus = "running" | "completed" | "failed" | "cancelled" | "waiting_confirmation"

export type AgentStep =
  | {id: string; type: "model_response"; createdAt: number; message: MessageLLM}
  | {id: string; type: "tool_call"; createdAt: number; toolCallId: string; toolName: string; params: unknown}
  | {id: string; type: "tool_result"; createdAt: number; toolCallId: string; toolName: string; result: ToolResult}
  | {id: string; type: "respond"; createdAt: number; text: string}
  | {id: string; type: "confirmation_request"; createdAt: number; confirmation: PendingToolConfirmation}
  | {id: string; type: "error"; createdAt: number; message: string}

export type AgentTurn = {
  id: string
  sessionId?: string
  userMessage: string
  startedAt: number
  finishedAt?: number
  status: AgentTurnStatus
  steps: AgentStep[]
  finalMessage?: string
  error?: string
}
```

- [ ] **Step 2: Builder**

```ts
// src/main/ai/turns/TurnBuilder.ts
import {nanoid} from "nanoid"

import type {AgentStep, AgentTurn, AgentTurnStatus} from "./types"

export class TurnBuilder {
  private turn: AgentTurn

  constructor(userMessage: string, sessionId?: string) {
    this.turn = {
      id: nanoid(),
      sessionId,
      userMessage,
      startedAt: Date.now(),
      status: "running",
      steps: [],
    }
  }

  get id() {
    return this.turn.id
  }

  appendStep(step: Omit<AgentStep, "id" | "createdAt">): AgentStep {
    const full = {...step, id: nanoid(), createdAt: Date.now()} as AgentStep
    this.turn.steps.push(full)
    return full
  }

  setStatus(status: AgentTurnStatus): void {
    this.turn.status = status
    if (status !== "running" && status !== "waiting_confirmation" && this.turn.finishedAt == null) {
      this.turn.finishedAt = Date.now()
    }
  }

  setFinalMessage(text: string): void {
    this.turn.finalMessage = text
  }

  setError(message: string): void {
    this.turn.error = message
  }

  snapshot(): AgentTurn {
    return JSON.parse(JSON.stringify(this.turn))
  }
}
```

- [ ] **Step 3: Tests**

```ts
// tests/main/ai/turns/TurnBuilder.test.ts
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TurnBuilder} from "@main/ai/turns/TurnBuilder"

describe("TurnBuilder", () => {
  it("creates a turn with status running", () => {
    const b = new TurnBuilder("hi")
    expect(b.snapshot().status).toBe("running")
    expect(b.snapshot().userMessage).toBe("hi")
    expect(b.snapshot().steps).toEqual([])
  })

  it("appends typed steps with auto id + timestamp", () => {
    const b = new TurnBuilder("hi")
    b.appendStep({type: "respond", text: "Done."})
    const snap = b.snapshot()
    expect(snap.steps).toHaveLength(1)
    expect(snap.steps[0]).toMatchObject({type: "respond", text: "Done."})
    expect(snap.steps[0].id).toBeTruthy()
    expect(snap.steps[0].createdAt).toBeGreaterThan(0)
  })

  it("sets finishedAt when transitioning to a terminal status", () => {
    const b = new TurnBuilder("hi")
    b.setStatus("completed")
    expect(b.snapshot().finishedAt).toBeGreaterThan(0)
  })

  it("does not set finishedAt for waiting_confirmation", () => {
    const b = new TurnBuilder("hi")
    b.setStatus("waiting_confirmation")
    expect(b.snapshot().finishedAt).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run, commit**

```bash
pnpm evitest run tests/main/ai/turns/TurnBuilder.test.ts
git add src/main/ai/turns tests/main/ai/turns
git commit -m "feat: add AgentTurn/AgentStep types and TurnBuilder for structured turn tracking"
```

---

## Task 4: AIController loop — `tool_choice: required`, respond interception, turn tracking, delete fallback

**Files:**

- Modify: `src/main/ai/AIController.ts`
- Modify: `tests/main/ai/AIController.test.ts`

This is the heart of Phase 4. Changes to `sendMessage`:

1. Pass `toolChoice: "required"` to every `callLLM` call.
2. Build a `TurnBuilder` at the start; thread `turn` reference into the loop.
3. For each model response, `turn.appendStep({type: "model_response", message})`.
4. For each tool call:
   - If `name === "respond"`:
     - Extract `text` from params (string fallback if missing).
     - `turn.appendStep({type: "respond", text})`
     - Push a synthetic tool result (`{success: true, data: text}`) into `conversationHistory` so history stays well-formed.
     - Set `finalContent = text`; **break** out of the tool-call loop AND the outer iteration loop.
   - Otherwise: existing flow — `runBeforeToolCall` → execute → `runAfterToolCall` — plus `turn.appendStep({type: "tool_call", ...})` and `turn.appendStep({type: "tool_result", ...})`.
5. Delete `requireVisibleFinalAnswer` and its retry branch. Replace with: if no tool calls AND no respond AND model returned plain content → use that content as fallback final (degraded providers).
6. Final: `turn.setFinalMessage(finalContent)`; `turn.setStatus("completed")`; on error, `turn.setStatus("failed")`/`"cancelled"`.

Also: `callLLM` private gains the `toolChoice` parameter and forwards to `activeProvider.chat`.

- [ ] **Step 1: Extend AIController tests**

Add to the existing test file:

```ts
import type {ToolChoice} from "@main/ai/types"

it("calls the LLM with tool_choice: 'required' on every iteration", async () => {
  const chatSpy = vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
    message: {role: "assistant", tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Hi."}}}]},
    done: true,
  })
  await ctrl.sendMessage("hi")
  expect(chatSpy).toHaveBeenCalled()
  const [, , , toolChoice] = chatSpy.mock.calls[0]
  expect(toolChoice).toBe("required")
})

it("treats respond() as the final message and skips hook/executor for it", async () => {
  const beforeHook = vi.fn(async () => ({action: "pass"}))
  ctrl.getHooks().registerBeforeToolCall(beforeHook)
  const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
  vi.spyOn((ctrl as any).openaiClient, "chat").mockResolvedValue({
    message: {role: "assistant", tool_calls: [{id: "c1", type: "function", function: {name: "respond", arguments: {text: "Done."}}}]},
    done: true,
  })

  const r = await ctrl.sendMessage("hi")
  expect(r.success).toBe(true)
  expect(r.message?.content).toBe("Done.")
  // respond is not subject to hooks or executor — it's a protocol tool.
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

it("processes a write tool then respond in two iterations", async () => {
  stubSchemas()
  vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "Task created: x"})
  let i = 0
  vi.spyOn((ctrl as any).openaiClient, "chat").mockImplementation(async () => {
    const responses = [
      {
        message: {role: "assistant", tool_calls: [{id: "c1", type: "function", function: {name: "create_task", arguments: {content: "x"}}}]},
        done: true,
      },
      {
        message: {role: "assistant", tool_calls: [{id: "c2", type: "function", function: {name: "respond", arguments: {text: "Created."}}}]},
        done: true,
      },
    ]
    return responses[i++]
  })
  ;(ctrl as any).currentToolSchemas = new Map([["create_task", {type: "object", properties: {content: {type: "string"}}, required: ["content"]}]])
  // stubSchemas only knows about delete_task/list_tasks — override for this test.

  const r = await ctrl.sendMessage("make task x")
  expect(r.success).toBe(true)
  expect(r.message?.content).toBe("Created.")
})
```

- [ ] **Step 2: Implement loop changes**

Touch points in `sendMessage`:

```ts
// remove requireVisibleFinalAnswer entirely

const turn = new TurnBuilder(userMessage)

// at start of loop body, no more requireVisibleFinalAnswer system message

const response = await this.callLLM(messages, promptTier, "required")
const assistantMessage = response.message

turn.appendStep({type: "model_response", message: assistantMessage})

if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
  this.conversationHistory.push(assistantMessage)

  let respondTextForTurn: string | null = null

  for (const toolCall of assistantMessage.tool_calls) {
    if (toolCall.function.name === "respond") {
      const args = typeof toolCall.function.arguments === "object" ? toolCall.function.arguments : {}
      const text = typeof (args as any).text === "string" ? (args as any).text : ""
      turn.appendStep({type: "respond", text})
      // Synthesize a tool result so the message log stays valid.
      const synthetic: ToolResult = {success: true, data: text}
      this.conversationHistory.push({role: "tool", content: JSON.stringify(synthetic), tool_call_id: toolCall.id})
      respondTextForTurn = text
      continue // process remaining tool calls in this iteration
    }

    const decision = await this.hooks.runBeforeToolCall(ctx, toolCall)
    let toolResultStruct: {success: boolean; data?: string; error?: string}

    turn.appendStep({type: "tool_call", toolCallId: toolCall.id, toolName: toolCall.function.name, params: toolCall.function.arguments})

    if (decision.action === "skip") {
      toolResultStruct = {success: false, error: decision.reason}
    } else {
      toolResultStruct = await this.executeToolCall(toolCall)
    }

    await this.hooks.runAfterToolCall(ctx, toolCall, toolResultStruct as ToolResult)
    turn.appendStep({type: "tool_result", toolCallId: toolCall.id, toolName: toolCall.function.name, result: toolResultStruct as ToolResult})

    toolCalls.push({name: toolCall.function.name, result: toolResultStruct.data?.toString() || toolResultStruct.error || "Done"})
    this.conversationHistory.push({role: "tool", content: JSON.stringify(toolResultStruct), tool_call_id: toolCall.id})
  }

  if (respondTextForTurn !== null) {
    finalContent = respondTextForTurn
    break
  }
} else {
  // Degraded provider that ignored tool_choice. Use plain content as fallback.
  const rawContent = assistantMessage.content ?? ""
  finalContent = filterThinkBlocks(rawContent)
  if (!finalContent) {
    finalContent = "I completed the request, but could not produce a visible final response."
  }
  this.conversationHistory.push({role: "assistant", content: finalContent})
  turn.appendStep({type: "respond", text: finalContent})
  break
}
```

And in `callLLM`:

```ts
private async callLLM(messages: MessageLLM[], promptTier: PromptTier, toolChoice?: ToolChoice): Promise<{message: MessageLLM; done: boolean}> {
  const tools = this.getToolsForTier(promptTier)
  this.currentToolSchemas = new Map(tools.map((tool) => [tool.function.name, tool.function.parameters]))
  return this.activeProvider.chat(messages, tools, this.abortController?.signal, toolChoice)
}
```

On success path: `turn.setFinalMessage(finalContent); turn.setStatus("completed")`. On error: `turn.setStatus("failed"); turn.setError(message)`. On cancel: `turn.setStatus("cancelled")`.

The turn snapshot isn't returned from `sendMessage` yet (Phase 5/7 do that). For now it lives in-memory and is dropped at end of function. The point is to have the build sites wired so Phase 5 can persist them later.

- [ ] **Step 3: Run AIController tests**

```bash
pnpm evitest run tests/main/ai/AIController.test.ts
```

Should pass new cases AND existing cases (some may need to adapt — the existing tests that mock `callLLM` with a plain-content reply must be updated to either use `respond` tool_calls or rely on the fallback path).

- [ ] **Step 4: Adapt existing AIController tests**

The old tests rely on the previous behavior where plain `assistant.content` is the final message. With the fallback path still in place, they should mostly keep working. Two will likely need adjustment:

- "returns success on a no-tool response" — expect fallback path to use the content. Should still work.
- "invokes BeforeToolCallHook for each tool call…" — uses `list_tasks` then plain content. Still works via fallback. The hook still fires.

Adjust expectations as needed.

- [ ] **Step 5: Full main suite**

```bash
pnpm test:main
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/AIController.ts tests/main/ai/AIController.test.ts
git commit -m "feat: enforce tool_choice required + respond protocol + per-turn tracking"
```

---

## Task 5: System prompt picks up `respond`

**Files:**

- Modify: `src/main/ai/promts/getSystemPrompt.ts`
- Modify: `src/main/ai/promts/getSystemPromptCompact.ts`
- Modify: `src/main/ai/promts/getSystemPromptTiny.ts`

Append (or weave into OUTPUT CONTRACT) a short paragraph:

> The only way to send text to the user is the `respond` tool. Call `respond({text: "..."})` once when the task is fully complete (or when you need to ask a question). The user does not see any other text — only what you pass to `respond`.

In tiny prompt, one-liner:

> Use `respond({text})` for any user-visible message.

- [ ] **Step 1-3:** Edit each prompt file; lint; commit

```bash
git add src/main/ai/promts
git commit -m "docs(ai): teach system prompts to use respond tool for user-visible messages"
```

---

## Task 6: Full-suite gate

- [ ] `pnpm lint`
- [ ] `pnpm typecheck:all`
- [ ] `pnpm test` — net new ~10 cases.
- [ ] `pnpm circular`
- [ ] Manual smoke: chat with the assistant. Verify the assistant uses `respond` (visible in renderer toolCalls list), and the message text matches.

If any gate fails, fix in a new commit.

---

## Self-Review

**Spec coverage** (Phase 4 done criteria):

- "Every user request produces an `AgentTurn`" → Task 4 (TurnBuilder per send).
- "Tool calls/results are visible as structured steps" → Task 4 (appendStep on each).
- "Existing UI still works" → Task 4 fallback path + tests.
- "Rollback/cancel can operate at turn level" → status transitions in Task 4.

**`tool_choice: required` + `respond`:**

- Architecturally eliminates the "model says done but didn't do anything" failure class — for compliant providers.
- For non-compliant providers (some local llama variants), graceful fallback to plain content keeps the assistant usable.
- `respond` is a registry tool — visible in `AI_TOOLS` schema, hidden from MCP via Task 2.

**Out of scope:**

- Returning the turn snapshot from `sendMessage` to the renderer — Phase 7 (event stream).
- Persisting turns to SQLite — Phase 5.
- Removing prompt-level safety rules — Phase 10.

**Risk hotspots:**

- Some existing tests script plain-content responses. The fallback path keeps those passing, but new tests for `respond` must use the tool-call shape.
- The `arguments` field on tool calls is `object` after `OpenAiCompatibleClient` parsing but `string` before. Match production shape (object) in new test scripts.
- `respond` skipping the hook chain means the policy hook never sees it. That's correct — `respond` is not destructive — but it's worth a code comment to prevent future confusion.
