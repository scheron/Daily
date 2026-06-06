# Phase 3 — Tool Policy & Confirmations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (or subagent-driven-development if subagents are available) to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move destructive-tool safety from the system prompt into deterministic code. When the in-app assistant calls a `isDestructive` tool, the runtime suspends the turn, shows a structured confirmation card in the renderer, and only executes the tool after the user explicitly confirms. Cancel/timeout returns `skip` — the model receives a synthesized tool error and continues the loop.

**Architecture:** A single `BeforeToolCallHook` (`policyHook`) registered on the existing `HookChain` during `AIController.init()`. The hook looks up the tool in the registry; for non-destructive tools it returns `{action: "pass"}` immediately; for destructive ones it stores a `PendingConfirmation` on the controller, broadcasts `ai:confirmation-required` to the renderer, and `await`s a `Promise<boolean>`. The Promise is resolved by IPC handlers `ai:confirm-tool-call` / `ai:cancel-tool-call`, or by a 30-second timeout. MCP calls bypass this entirely (they go straight to `ToolExecutor` and don't fire hooks), so no MCP behavior change.

**Tech Stack:** TypeScript, existing `HookChain`, no new dependencies. Renderer gets a new `ToolConfirmationCard.vue` rendered above the chat form.

**Spec source:** [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 3 (Tool Policy And Confirmations), as revised 2026-06-06. We adopt the Chelsea-derived simplification: policy _is_ a hook, confirmation _is_ a Promise — no `PolicyDecision` enum, no separate `ToolPolicy` class.

---

## Conventions

- **TDD** for the policy hook (new file, isolated, easy to unit-test). Renderer UI is small enough that we ship it without separate component tests.
- **Commit per task.** Each task below produces one focused commit.
- **Test command:** `pnpm evitest run tests/main/<path>` for one file, `pnpm test:main` for the main suite. Never `pnpm vitest` directly.
- **Path aliases:** `@/` → `src/main/`, `@shared/` → `src/shared/`, `@main/` → `src/main/` in tests.

---

## File Structure (target)

```
src/main/ai/
  policy/
    types.ts                       — PendingConfirmation (internal, has resolve+timer)
    describeToolCall.ts            — deterministic title/summary/details per tool name
    policyHook.ts                  — createPolicyHook(controller): BeforeToolCallHook
  AIController.ts                  — modified: pendingConfirmation state, awaitConfirmation,
                                     confirmToolCall, cancelToolCall, broadcastConfirmation
                                     callback, hook registration in init, cancel/clearHistory
                                     resolve pending as false

src/shared/types/
  ai.ts                            — add PendingToolConfirmation (serializable)
  ipc.ts                           — add ai:confirm-tool-call, ai:cancel-tool-call,
                                     ai:on-confirmation-required, ai:on-confirmation-resolved

src/main/
  preload.ts                       — expose 4 new channels
  setup/ipc/ai.ts                  — register handlers, wire broadcaster
  app.ts                           — pass broadcastConfirmation callback to AIController ctor

src/renderer/src/
  stores/ai/ai.store.ts            — pendingConfirmation ref, confirm/cancel actions, listener
  ui/views/Assistant/{fragments}/cards/
    ToolConfirmationCard.vue       — new
  ui/views/Assistant/AssistantView.vue
                                   — render the card when pendingConfirmation is set

tests/main/ai/
  policy/
    describeToolCall.test.ts       — every destructive tool has a non-empty summary
    policyHook.test.ts             — read passes, destructive suspends, confirm/cancel/timeout
  AIController.test.ts             — +3 cases: confirm executes, cancel doesn't, multiple
                                     destructive tools each prompt
```

---

## Task 0: Shared types (`PendingToolConfirmation`, IPC channels)

**Files:**

- Modify: `src/shared/types/ai.ts`
- Modify: `src/shared/types/ipc.ts`

- [ ] **Step 1: Add the serializable confirmation shape**

In `src/shared/types/ai.ts`, append:

```ts
/**
 * The structured object the renderer receives when a destructive tool call
 * is awaiting confirmation. The internal `PendingConfirmation` (in main)
 * carries an additional `resolve` callback and timeout handle that cannot
 * cross the IPC boundary — only this serializable subset goes to the
 * renderer.
 */
export type PendingToolConfirmation = {
  id: string
  toolName: string
  /** Short verb-phrase ("Delete task", "Permanently delete task"). */
  title: string
  /** Single-line description ("Move 'buy milk' to trash"). */
  summary: string
  /** Optional supplementary lines ("Task ID: abc123"). */
  details?: string[]
  createdAt: number
}
```

- [ ] **Step 2: Add IPC channels to the `BridgeIPC` interface**

In `src/shared/types/ipc.ts`, locate the `// === AI ===` block and add after `ai:update-config`:

```ts
  "ai:confirm-tool-call": (confirmationId: string) => Promise<boolean>
  "ai:cancel-tool-call": (confirmationId: string) => Promise<boolean>
```

And in the `// === AI LOCAL EVENTS ===` block (or in a new `// === AI EVENTS ===` section right above it), add:

```ts
  "ai:on-confirmation-required": (callback: (confirmation: PendingToolConfirmation) => void) => () => void
  "ai:on-confirmation-resolved": (callback: (payload: {confirmationId: string}) => void) => () => void
```

Re-export `PendingToolConfirmation` from the import block at the top of `ipc.ts` (it's imported alongside `AIConfig`, `AIResponse`, etc).

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck:shared
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/ai.ts src/shared/types/ipc.ts
git commit -m "feat: add PendingToolConfirmation type and confirmation IPC channels"
```

---

## Task 1: Deterministic tool-call descriptions

**Files:**

- Create: `src/main/ai/policy/describeToolCall.ts`
- Test: `tests/main/ai/policy/describeToolCall.test.ts`

The roadmap insists on **structured** confirmation cards, not model-phrased ones. Each destructive tool needs a title/summary/details builder driven by the tool name + params, fully deterministic.

Destructive tools (per registry grep):

- `delete_task` — "Move task to trash"
- `delete_project` — "Move project to trash"
- `delete_tag` — "Delete tag"
- `remove_task_attachment` — "Remove attachment"
- `permanently_delete_task` — "Permanently delete task"

- [ ] **Step 1: Write tests first**

```ts
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {describeToolCall} from "@main/ai/policy/describeToolCall"

describe("describeToolCall", () => {
  it("returns a title and summary for delete_task", () => {
    const d = describeToolCall("delete_task", {task_id: "abc123"})
    expect(d.title).toMatch(/move.*trash/i)
    expect(d.summary).toContain("abc123")
  })

  it("returns a strong-warning title for permanently_delete_task", () => {
    const d = describeToolCall("permanently_delete_task", {task_id: "abc123"})
    expect(d.title).toMatch(/permanent/i)
    expect(d.summary).toContain("abc123")
  })

  it("returns a title for delete_project, delete_tag, remove_task_attachment", () => {
    expect(describeToolCall("delete_project", {project_id: "p1"}).title).toBeTruthy()
    expect(describeToolCall("delete_tag", {tag_id: "t1"}).title).toBeTruthy()
    expect(describeToolCall("remove_task_attachment", {task_id: "t1", file_id: "f1"}).title).toBeTruthy()
  })

  it("falls back to a generic title for unknown tool names", () => {
    const d = describeToolCall("some_future_destructive", {})
    expect(d.title).toBeTruthy()
    expect(d.summary).toBeTruthy()
  })

  it("never throws on missing or malformed params", () => {
    expect(() => describeToolCall("delete_task", {})).not.toThrow()
    expect(() => describeToolCall("delete_task", null as any)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

```bash
pnpm evitest run tests/main/ai/policy/describeToolCall.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/ai/policy/describeToolCall.ts

export type ToolCallDescription = {
  title: string
  summary: string
  details?: string[]
}

type Builder = (params: Record<string, unknown>) => ToolCallDescription

function str(value: unknown): string {
  return typeof value === "string" && value ? value : "(unspecified)"
}

const BUILDERS: Record<string, Builder> = {
  delete_task: (p) => ({
    title: "Move task to trash",
    summary: `Move task ${str(p.task_id)} to trash. It can be restored later from the trash view.`,
    details: [`Task ID: ${str(p.task_id)}`],
  }),
  delete_project: (p) => ({
    title: "Move project to trash",
    summary: `Move project ${str(p.project_id)} (and all of its tasks) to trash. Tasks remain restorable.`,
    details: [`Project ID: ${str(p.project_id)}`],
  }),
  delete_tag: (p) => ({
    title: "Delete tag",
    summary: `Delete tag ${str(p.tag_id)}. The tag is removed from all tasks that currently use it.`,
    details: [`Tag ID: ${str(p.tag_id)}`],
  }),
  remove_task_attachment: (p) => ({
    title: "Remove attachment",
    summary: `Remove attachment ${str(p.file_id)} from task ${str(p.task_id)}.`,
    details: [`Task ID: ${str(p.task_id)}`, `File ID: ${str(p.file_id)}`],
  }),
  permanently_delete_task: (p) => ({
    title: "Permanently delete task",
    summary: `Permanently delete task ${str(p.task_id)}. This cannot be undone.`,
    details: [`Task ID: ${str(p.task_id)}`],
  }),
}

export function describeToolCall(toolName: string, rawParams: unknown): ToolCallDescription {
  const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>
  const builder = BUILDERS[toolName]
  if (builder) return builder(params)

  return {
    title: `Confirm action: ${toolName}`,
    summary: `The assistant requested a destructive action (${toolName}) that needs your approval.`,
  }
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
pnpm evitest run tests/main/ai/policy/describeToolCall.test.ts
```

Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/policy/describeToolCall.ts tests/main/ai/policy/describeToolCall.test.ts
git commit -m "feat: add deterministic tool-call description builder for confirmation cards"
```

---

## Task 2: Policy hook (`createPolicyHook`)

**Files:**

- Create: `src/main/ai/policy/types.ts`
- Create: `src/main/ai/policy/policyHook.ts`
- Test: `tests/main/ai/policy/policyHook.test.ts`

The hook's contract:

- If `getRegisteredTool(name).isDestructive === false` → `{action: "pass"}` immediately.
- If destructive → call `host.awaitConfirmation(name, params)` (returns `Promise<boolean>`).
- `true` → `{action: "pass"}`. `false` → `{action: "skip", reason: "User declined the action"}`.
- Unknown tool name → `{action: "skip", reason: "Unknown tool"}`. (The executor would also reject, but skipping early avoids an unnecessary execute call.)

`host` is a minimal interface to avoid an import cycle with `AIController`. We pass `this` from the controller; only the one method is needed.

- [ ] **Step 1: Write the policy types**

```ts
// src/main/ai/policy/types.ts

/**
 * Internal representation of a pending confirmation kept on AIController.
 * The `resolve` and `timeoutId` fields are NOT serializable — they stay
 * in main. The PendingToolConfirmation that flies to the renderer is
 * derived from these fields.
 */
export type PendingConfirmation = {
  id: string
  toolName: string
  params: unknown
  title: string
  summary: string
  details?: string[]
  createdAt: number
  resolve: (confirmed: boolean) => void
  timeoutId: NodeJS.Timeout
}

/**
 * What the policy hook needs from AIController. Kept narrow to avoid a
 * cyclical import and to make the hook unit-testable with a fake host.
 */
export type PolicyHookHost = {
  awaitConfirmation(toolName: string, params: unknown): Promise<boolean>
}

/** Default time before an unanswered confirmation auto-resolves to false. */
export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 30_000
```

- [ ] **Step 2: Write tests first**

```ts
// @ts-nocheck
// tests/main/ai/policy/policyHook.test.ts

import {describe, expect, it, vi} from "vitest"

import {createPolicyHook} from "@main/ai/policy/policyHook"

const ctx = {turnId: "t1", userMessage: "x", startedAt: 0, messages: []} as any

function call(name: string, args = {}) {
  return {id: "c1", type: "function", function: {name, arguments: JSON.stringify(args)}} as any
}

describe("policyHook", () => {
  it("passes non-destructive tools through without prompting", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("list_tasks"))
    expect(d).toEqual({action: "pass"})
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
  })

  it("calls awaitConfirmation for a destructive tool and passes on true", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("delete_task", {task_id: "abc"}))
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {task_id: "abc"})
    expect(d).toEqual({action: "pass"})
  })

  it("skips with a user-facing reason when confirmation returns false", async () => {
    const host = {awaitConfirmation: vi.fn(async () => false)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("delete_task", {task_id: "abc"}))
    expect(d.action).toBe("skip")
    expect((d as any).reason).toMatch(/declin|cancel/i)
  })

  it("skips unknown tool names without calling the host", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("totally_made_up_tool"))
    expect(d.action).toBe("skip")
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
  })

  it("parses string arguments before forwarding to host", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    await hook(ctx, {id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}})
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {task_id: "abc"})
  })

  it("treats unparseable arguments as an empty object", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    await hook(ctx, {id: "c1", type: "function", function: {name: "delete_task", arguments: "not-json"}})
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {})
  })
})
```

- [ ] **Step 3: Run test, confirm fail**

```bash
pnpm evitest run tests/main/ai/policy/policyHook.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/main/ai/policy/policyHook.ts

import {getRegisteredTool} from "@/ai/tools/registry"

import type {BeforeToolCallHook} from "@/ai/hooks/types"
import type {PolicyHookHost} from "./types"

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== "string") return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Creates the policy hook that gates destructive tools behind explicit user
 * confirmation. Read-only and non-destructive write tools (create/update/
 * complete/etc) pass straight through.
 *
 * MCP calls do not fire this hook — they bypass the hook chain entirely
 * because confirmation happens on the MCP client surface.
 */
export function createPolicyHook(host: PolicyHookHost): BeforeToolCallHook {
  return async (_ctx, call) => {
    const name = call.function.name
    const tool = getRegisteredTool(name)

    if (!tool) {
      return {action: "skip", reason: `Unknown tool: ${name}`}
    }

    if (!tool.isDestructive) {
      return {action: "pass"}
    }

    const params = parseArgs(call.function.arguments)
    const confirmed = await host.awaitConfirmation(name, params)
    if (confirmed) return {action: "pass"}
    return {action: "skip", reason: "User declined the action"}
  }
}
```

- [ ] **Step 5: Run test, confirm pass**

```bash
pnpm evitest run tests/main/ai/policy/policyHook.test.ts
```

Expected: PASS (6 cases).

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck:main
```

- [ ] **Step 7: Commit**

```bash
git add src/main/ai/policy/types.ts src/main/ai/policy/policyHook.ts \
        tests/main/ai/policy/policyHook.test.ts
git commit -m "feat: add policy hook gating destructive tools on user confirmation"
```

---

## Task 3: Wire the hook into `AIController` (state, methods, broadcasts)

**Files:**

- Modify: `src/main/ai/AIController.ts`
- Modify: `tests/main/ai/AIController.test.ts` (extend)

This task is the heart of the phase. Five interlocking changes to `AIController`:

1. New private state: `private pendingConfirmation: PendingConfirmation | null = null`.
2. New constructor param: optional `broadcastConfirmation?: (event: {type: "required"; confirmation: PendingToolConfirmation} | {type: "resolved"; confirmationId: string}) => void`. Stored as a field.
3. New private method: `awaitConfirmation(toolName, params): Promise<boolean>`. Builds the description, creates the Promise, stashes `PendingConfirmation`, broadcasts `required`, returns Promise.
4. New public methods: `confirmToolCall(id): boolean` and `cancelToolCall(id): boolean`. Both validate the id, clear the timer, resolve, broadcast `resolved`, clear state.
5. Register the policy hook in `init()` after `await this.updateConfig(config)`.

Additional integration:

- `cancel()`: also resolve pending confirmation as `false` (so an in-flight turn can unwind).
- `clearHistory()`: same — pending confirmation is implicitly cancelled.
- `dispose()`: same.

- [ ] **Step 1: Extend tests in `tests/main/ai/AIController.test.ts`**

Append these cases (after the existing `skip decision from BeforeToolCallHook…` test):

```ts
it("confirming a pending destructive tool causes it to execute", async () => {
  const executor = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "deleted"})
  withScriptedLLM(ctrl, [
    {
      role: "assistant",
      tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}}],
    },
    {role: "assistant", content: "Done."},
  ])

  const sendPromise = ctrl.sendMessage("delete it")

  // Wait one microtask cycle so the hook can register the pending confirmation.
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))

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
  const executor = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true, data: "deleted"})
  withScriptedLLM(ctrl, [
    {
      role: "assistant",
      tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}}],
    },
    {role: "assistant", content: "Skipped."},
  ])

  const sendPromise = ctrl.sendMessage("delete it")
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))

  const pending = (ctrl as any).pendingConfirmation
  expect(pending).toBeTruthy()
  const ok = ctrl.cancelToolCall(pending.id)
  expect(ok).toBe(true)

  const r = await sendPromise
  expect(r.success).toBe(true)
  expect(executor).not.toHaveBeenCalled()
})

it("global cancel() resolves a pending confirmation as cancelled", async () => {
  vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
  withScriptedLLM(ctrl, [
    {
      role: "assistant",
      tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}}],
    },
    // Subsequent LLM call will throw AbortError because cancel() also aborts.
    {throws: Object.assign(new Error("aborted"), {name: "AbortError"})},
  ])

  const sendPromise = ctrl.sendMessage("delete it")
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))

  expect((ctrl as any).pendingConfirmation).toBeTruthy()
  ctrl.cancel()

  const r = await sendPromise
  expect(r.success).toBe(false)
  expect((ctrl as any).pendingConfirmation).toBeNull()
})

it("confirmToolCall with wrong id returns false and does not resolve", async () => {
  vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
  withScriptedLLM(ctrl, [
    {
      role: "assistant",
      tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}}],
    },
    {role: "assistant", content: "Done."},
  ])

  const sendPromise = ctrl.sendMessage("delete it")
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))

  expect(ctrl.confirmToolCall("wrong-id")).toBe(false)
  const pending = (ctrl as any).pendingConfirmation
  expect(pending).toBeTruthy()
  // Now confirm with the right id to let the turn finish.
  ctrl.confirmToolCall(pending.id)
  await sendPromise
})
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
pnpm evitest run tests/main/ai/AIController.test.ts
```

Expected: FAIL — `confirmToolCall` / `cancelToolCall` / `pendingConfirmation` not on AIController yet.

- [ ] **Step 3: Modify `AIController.ts`**

Imports (add to existing block):

```ts
import {nanoid} from "nanoid" // already imported

import {describeToolCall} from "@/ai/policy/describeToolCall"
import {createPolicyHook} from "@/ai/policy/policyHook"
import {DEFAULT_CONFIRMATION_TIMEOUT_MS} from "@/ai/policy/types"

import type {PendingConfirmation} from "@/ai/policy/types"
import type {PendingToolConfirmation} from "@shared/types/ai"
```

Type alias for the broadcaster, placed near the top of the file (above the class):

```ts
export type ConfirmationBroadcastEvent = {type: "required"; confirmation: PendingToolConfirmation} | {type: "resolved"; confirmationId: string}
```

Constructor: add the third optional parameter and store it:

```ts
constructor(
  private storage: StorageController,
  broadcastState?: (state: LocalRuntimeState) => void,
  private broadcastConfirmation?: (event: ConfirmationBroadcastEvent) => void,
) {
  this.executor = new ToolExecutor(storage)
  this.openaiClient = new RemoteAiClient()
  this.localClient = new LocalAiClient(broadcastState)
}
```

New private state field:

```ts
private pendingConfirmation: PendingConfirmation | null = null
```

In `init()`, register the hook after `await this.updateConfig(config)`:

```ts
this.hooks.registerBeforeToolCall(createPolicyHook(this))
```

Modify `cancel()`:

```ts
cancel(): boolean {
  this.resolvePendingConfirmation(false)
  this.abortController?.abort()
  return true
}
```

Modify `clearHistory()`:

```ts
clearHistory(): boolean {
  this.resolvePendingConfirmation(false)
  this.conversationHistory = []
  return true
}
```

Modify `dispose()`:

```ts
async dispose(): Promise<void> {
  this.resolvePendingConfirmation(false)
  await this.localClient.dispose()
}
```

New public methods:

```ts
confirmToolCall(confirmationId: string): boolean {
  return this.resolvePendingConfirmation(true, confirmationId)
}

cancelToolCall(confirmationId: string): boolean {
  return this.resolvePendingConfirmation(false, confirmationId)
}
```

New private methods (place them near `executeToolCall`):

```ts
/** Called from the policy hook. Returns when the user confirms, cancels, or the timer fires. */
async awaitConfirmation(toolName: string, params: unknown): Promise<boolean> {
  // Defensive: clear any stale pending (shouldn't happen given the mutex, but cheap insurance).
  this.resolvePendingConfirmation(false)

  const description = describeToolCall(toolName, params)
  const id = nanoid()
  const createdAt = Date.now()

  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      this.resolvePendingConfirmation(false, id)
    }, DEFAULT_CONFIRMATION_TIMEOUT_MS)

    this.pendingConfirmation = {
      id,
      toolName,
      params,
      title: description.title,
      summary: description.summary,
      details: description.details,
      createdAt,
      resolve,
      timeoutId,
    }

    const payload: PendingToolConfirmation = {
      id,
      toolName,
      title: description.title,
      summary: description.summary,
      details: description.details,
      createdAt,
    }

    try {
      this.broadcastConfirmation?.({type: "required", confirmation: payload})
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "broadcastConfirmation failed", err)
    }
  })
}

/**
 * Resolve any pending confirmation. If `expectedId` is provided and
 * doesn't match the live confirmation, this is a no-op and returns false
 * (stale/late callbacks). Returns true if a pending confirmation was
 * actually resolved.
 */
private resolvePendingConfirmation(confirmed: boolean, expectedId?: string): boolean {
  const pending = this.pendingConfirmation
  if (!pending) return false
  if (expectedId !== undefined && pending.id !== expectedId) return false

  clearTimeout(pending.timeoutId)
  this.pendingConfirmation = null

  try {
    this.broadcastConfirmation?.({type: "resolved", confirmationId: pending.id})
  } catch (err) {
    logger.warn(logger.CONTEXT.AI, "broadcastConfirmation failed", err)
  }

  pending.resolve(confirmed)
  return true
}
```

- [ ] **Step 4: Run AI tests**

```bash
pnpm evitest run tests/main/ai/AIController.test.ts
```

Expected: all old tests still pass + 4 new cases pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck:main
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/AIController.ts tests/main/ai/AIController.test.ts
git commit -m "feat: gate destructive AI tool calls behind user confirmation in AIController"
```

---

## Task 4: IPC handlers + preload + app wiring

**Files:**

- Modify: `src/main/setup/ipc/ai.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/app.ts`

- [ ] **Step 1: Add IPC handlers**

Edit `src/main/setup/ipc/ai.ts` — add to the existing function:

```ts
ipcMain.handle("ai:confirm-tool-call", (_event, confirmationId: string) => getAi()?.confirmToolCall(confirmationId) ?? false)
ipcMain.handle("ai:cancel-tool-call", (_event, confirmationId: string) => getAi()?.cancelToolCall(confirmationId) ?? false)
```

(These go right after `ai:cancel`.)

- [ ] **Step 2: Expose IPC channels in preload**

Edit `src/main/preload.ts`. Add to the `// === AI ===` block (after `ai:update-config`):

```ts
  "ai:confirm-tool-call": (confirmationId: string) => ipcRenderer.invoke("ai:confirm-tool-call", confirmationId) as Promise<boolean>,
  "ai:cancel-tool-call": (confirmationId: string) => ipcRenderer.invoke("ai:cancel-tool-call", confirmationId) as Promise<boolean>,
```

And add to the AI events block:

```ts
  "ai:on-confirmation-required": (callback: (confirmation: PendingToolConfirmation) => void) => {
    const subscription = (_event: unknown, confirmation: PendingToolConfirmation) => callback(confirmation)
    ipcRenderer.on("ai:confirmation-required", subscription)
    return () => ipcRenderer.removeListener("ai:confirmation-required", subscription)
  },
  "ai:on-confirmation-resolved": (callback: (payload: {confirmationId: string}) => void) => {
    const subscription = (_event: unknown, payload: {confirmationId: string}) => callback(payload)
    ipcRenderer.on("ai:confirmation-resolved", subscription)
    return () => ipcRenderer.removeListener("ai:confirmation-resolved", subscription)
  },
```

Update the type import at the top to include `PendingToolConfirmation`.

- [ ] **Step 3: Wire the broadcaster in `app.ts`**

Edit `src/main/app.ts`. The `AIController` is constructed with two callbacks today; add a third for confirmation broadcasts. The assistant window receives them (the same window that shows the chat UI).

Replace the existing AI construction:

```ts
ai = new AIController(
  storage,
  (state) => {
    windows.main?.webContents.send("ai:local-state-changed", state)
  },
  (event) => {
    const target = windows.assistant ?? windows.main
    if (!target) return
    if (event.type === "required") {
      target.webContents.send("ai:confirmation-required", event.confirmation)
    } else {
      target.webContents.send("ai:confirmation-resolved", {confirmationId: event.confirmationId})
    }
  },
)
```

Note: both events are broadcast to `windows.assistant` if open, otherwise to `windows.main`. The chat UI mounts in whichever window the renderer chose to show it. (Today the chat lives in the main window; the assistant window route is reserved for the standalone assistant — broadcasting to both isn't necessary, but the fallback is cheap.)

- [ ] **Step 4: Typecheck main**

```bash
pnpm typecheck:main
```

- [ ] **Step 5: Commit**

```bash
git add src/main/setup/ipc/ai.ts src/main/preload.ts src/main/app.ts
git commit -m "feat: expose tool-confirmation IPC channels and wire renderer broadcaster"
```

---

## Task 5: Renderer store integration

**Files:**

- Modify: `src/renderer/src/stores/ai/ai.store.ts`

- [ ] **Step 1: Add state + actions**

In `useAiStore`:

1. Import the new type at the top:

   ```ts
   import type {AIConfig, AIMessage, AIProvider, LocalModelId, PendingToolConfirmation} from "@shared/types/ai"
   ```

2. Add the ref near the other refs:

   ```ts
   const pendingConfirmation = ref<PendingToolConfirmation | null>(null)
   ```

3. Install IPC listeners — add a one-time setup inside the store body (after the refs are declared), guarded so it only registers once per renderer process:

   ```ts
   let _confirmationListenersInstalled = false
   function installConfirmationListeners() {
     if (_confirmationListenersInstalled) return
     _confirmationListenersInstalled = true
     window.BridgeIPC["ai:on-confirmation-required"]((c) => {
       pendingConfirmation.value = c
     })
     window.BridgeIPC["ai:on-confirmation-resolved"](({confirmationId}) => {
       if (pendingConfirmation.value?.id === confirmationId) {
         pendingConfirmation.value = null
       }
     })
   }
   installConfirmationListeners()
   ```

4. Add actions:

   ```ts
   async function confirmPendingToolCall(): Promise<void> {
     const id = pendingConfirmation.value?.id
     if (!id) return
     await window.BridgeIPC["ai:confirm-tool-call"](id)
     // The "resolved" broadcast clears the ref; clear locally too in case the event hasn't arrived yet.
     pendingConfirmation.value = null
   }

   async function cancelPendingToolCall(): Promise<void> {
     const id = pendingConfirmation.value?.id
     if (!id) return
     await window.BridgeIPC["ai:cancel-tool-call"](id)
     pendingConfirmation.value = null
   }
   ```

5. In `cancelRequest()` and `clearHistory()` clear locally too:
   - `cancelRequest()`: add `pendingConfirmation.value = null` after `thinkState.setState("IDLE")`.
   - `clearHistory()`: add `pendingConfirmation.value = null` near `messages.value = []`.

6. Export the new state + actions in the `return` block:

   ```ts
   pendingConfirmation,
   confirmPendingToolCall,
   cancelPendingToolCall,
   ```

- [ ] **Step 2: Typecheck renderer**

```bash
pnpm typecheck:render
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/ai/ai.store.ts
git commit -m "feat: track pending tool confirmations in the AI store"
```

---

## Task 6: Confirmation card UI

**Files:**

- Create: `src/renderer/src/ui/views/Assistant/{fragments}/cards/ToolConfirmationCard.vue`
- Modify: `src/renderer/src/ui/views/Assistant/AssistantView.vue`

- [ ] **Step 1: Component**

```vue
<!-- src/renderer/src/ui/views/Assistant/{fragments}/cards/ToolConfirmationCard.vue -->
<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type {PendingToolConfirmation} from "@shared/types/ai"

defineProps<{
  confirmation: PendingToolConfirmation
  busy?: boolean
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="bg-warning/10 border-warning/40 rounded-lg border px-3 py-2.5">
    <div class="flex items-start gap-2">
      <BaseIcon name="alert-triangle" class="text-warning mt-0.5 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <h4 class="text-base-content text-sm font-medium">{{ confirmation.title }}</h4>
        <p class="text-base-content/70 mt-1 text-xs">{{ confirmation.summary }}</p>
        <ul v-if="confirmation.details && confirmation.details.length" class="text-base-content/50 mt-1.5 space-y-0.5 text-[11px]">
          <li v-for="(detail, idx) in confirmation.details" :key="idx" class="font-mono">{{ detail }}</li>
        </ul>
        <div class="mt-2.5 flex items-center gap-2">
          <BaseButton variant="primary" size="sm" :disabled="busy" @click="$emit('confirm')">Confirm</BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="busy" @click="$emit('cancel')">Cancel</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
```

If `alert-triangle` is not in the icon set, fall back to `tool` or `info` — keep the icon name aligned with what exists in `BaseIcon`. (Check `src/renderer/src/ui/base/BaseIcon/` for the available names; pick the closest match.)

- [ ] **Step 2: Render the card in `AssistantView.vue`**

In the messages template block (where `ChatMessage` v-for lives), add the card right after the v-for so it sits at the bottom of the message stream:

```vue
<ChatMessage v-for="msg in aiStore.messages" :key="msg.id" :message="msg" :can-retry="msg.id === retryableMessageId" @retry="aiStore.retryMessage" />

<ToolConfirmationCard
  v-if="aiStore.pendingConfirmation"
  :confirmation="aiStore.pendingConfirmation"
  @confirm="aiStore.confirmPendingToolCall"
  @cancel="aiStore.cancelPendingToolCall"
/>
```

Add the import at the top of the `<script setup>`:

```ts
import ToolConfirmationCard from "./{fragments}/cards/ToolConfirmationCard.vue"
```

While the card is visible, the chat is "waiting" — `isThinkLoading` will be true (the turn is still in flight). The existing `WaveText "Thinking..."` will appear under it. That's acceptable behavior; user sees both "Thinking..." and the card and understands the chat is paused until they answer.

- [ ] **Step 3: Typecheck renderer**

```bash
pnpm typecheck:render
```

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/views/Assistant/{fragments}/cards/ToolConfirmationCard.vue \
        src/renderer/src/ui/views/Assistant/AssistantView.vue
git commit -m "feat: render confirmation card in assistant chat for pending destructive tools"
```

---

## Task 7: Full-suite gate

- [ ] `pnpm lint` — clean.
- [ ] `pnpm typecheck:all` — zero errors across main / render / shared.
- [ ] `pnpm test` — all green. New test counts:
  - `describeToolCall.test.ts`: +5
  - `policyHook.test.ts`: +6
  - `AIController.test.ts`: +4 cases
- [ ] `pnpm circular` — no new circular dependencies.
- [ ] **Manual smoke**: `pnpm dev`. Open the chat. Ask the assistant to delete a real task ("delete the task X"). Expected:
  - Card appears with title "Move task to trash" + summary + task ID.
  - "Cancel" → card disappears, assistant replies that it didn't delete anything.
  - "Confirm" again → task is actually deleted (verify by reload or by checking the trash view).
  - While the card is visible, sending another message via the form should be rejected ("already processing").
  - Triggering app cancel (Stop button) while card is open: card disappears, turn ends.

If any gate fails, fix and amend the relevant commit (or stack a new commit if amending is risky after pushing).

---

## Self-Review Notes

**Spec coverage** (against [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) Phase 3 Done Criteria):

- "No destructive tool can execute directly from a model tool call." → Task 2 (hook returns skip until confirmed) + Task 3 (controller wires hook in `init`).
- "UI receives a structured confirmation object." → Task 0 (`PendingToolConfirmation`) + Task 4 (broadcast wiring) + Task 6 (card consumes it).
- "Confirm and cancel paths work." → Task 3 + Task 4 + Task 5; tested in Task 3 step 1 cases.
- "Tests prove destructive tools are gated by runtime policy." → `policyHook.test.ts` (Task 2) + AIController integration tests (Task 3).

**Out of scope** (deliberately, per roadmap "Recommended Execution Order"):

- `tool_choice: "required"` + `respond` tool — Phase 4.
- Turn entity / structured steps — Phase 4.
- Persisting confirmations into `ai_sessions` — Phase 5.
- Live event stream beyond confirmation events — Phase 7.
- Removing prompt-level safety rules — Phase 10 (do it once the runtime gate is proven).
- Per-session policy override (e.g. "auto-approve for the rest of this session") — explicitly NOT in scope; the hook always prompts for destructive tools.
- A separate `ToolPolicy` class with `PolicyDecision` enum — eliminated in favor of the hook + Promise shape per the roadmap's Chelsea-derived simplification.

**MCP relationship:**

MCP calls go through `ToolExecutor.execute(name, params, "mcp")` directly. They never enter `AIController.sendMessage`, so they never fire `HookChain.runBeforeToolCall`, so the policy hook never sees them. This is the intended split — confirmation happens on the caller's surface (Daily UI for `in-app`, the MCP client's surface for `mcp`). The MCP block-list in `src/main/mcp/constants.ts` remains the second line of defense (it filters destructive tools out of the MCP-exposed schema entirely).

**Risk hotspots:**

- **Mutex + suspended turn.** The turn holds the mutex while awaiting confirmation. A double-click on Send is rejected with "already processing" — same behavior as a normal in-flight turn. Users may find this slightly surprising ("I haven't even confirmed yet, why can't I type a new message?"). Acceptable for Phase 3; Phase 4's turn model + queue can soften this later.
- **Broadcast target choice.** We send to `windows.assistant ?? windows.main`. Today the chat UI lives in the main window; the standalone assistant window route is unused. If we later split the chat into the standalone window, the fallback already handles it.
- **Timeout default.** 30s is short for "AI requests deletion → user is reading the summary". If users complain, raise to 60s. The constant `DEFAULT_CONFIRMATION_TIMEOUT_MS` lives in one place (`policy/types.ts`).
- **Hook host coupling.** `createPolicyHook(host)` takes a minimal `{awaitConfirmation}` interface. Passing `this` from the controller works because the method is bound automatically via `.` access. The test fakes the host outright — no controller instance needed for unit tests.
- **`getRegisteredTool(name)` returning undefined inside the hook.** The hook returns `skip "Unknown tool"`, which matches what the existing `ToolExecutor.execute` would return anyway. This is the only case where the hook says "skip" without showing a confirmation card to the user — that's correct because there's nothing to confirm, the tool simply doesn't exist.
