# Agent System Roadmap

This document describes a phased plan for improving Daily's AI assistant from a simple single-agent tool-calling loop into a safer, observable, testable agent runtime.

The plan intentionally does not introduce an extension or plugin system. The goal is to keep the agent tightly integrated with Daily's task-management domain while borrowing useful runtime ideas from mature coding agents: durable sessions, turn-based execution, policy enforcement, structured tool results, compaction, events, and evals.

## Current Baseline

The current AI system is centered around:

- `src/main/ai/AIController.ts`
  - Owns conversation history.
  - Selects prompt tier.
  - Calls the active LLM provider.
  - Executes tool calls.
  - Returns one final assistant message to the renderer.
- `src/main/ai/tools/ToolExecutor.ts`
  - Contains a switch-based dispatcher.
  - Implements task, project, tag, attachment, and summary operations.
- `src/main/ai/tools/tools.jsonl`
  - Full tool schema set for stronger models.
- `src/main/ai/tools/tools-compact.jsonl`
  - Compact tool schema set for smaller models.
- `src/main/ai/promts/*`
  - System prompts for large, medium, and tiny prompt tiers.
- `src/main/ai/clients/*`
  - Remote and local OpenAI-compatible model clients.
- `src/renderer/src/stores/ai/ai.store.ts`
  - Renderer-side assistant state, message sending, retry, cancel, model selection.

Main weaknesses to address:

- Safety rules for destructive tools are prompt-only.
- Conversation history is a mutable in-memory array with no durable session model.
- Concurrent `sendMessage` calls can share mutable state.
- Error rollback only pops one history item.
- Tool schemas, tool name union, and executor implementation can drift.
- Tool results are string-oriented instead of structured.
- There is no dedicated eval harness for agent behavior.

## Target Architecture

The target architecture keeps the same high-level product behavior: the user talks to the Daily assistant, and the assistant manages tasks through tools. Internally, execution becomes more explicit:

```text
Renderer
  |
  | ai:send-message
  v
AIController
  |
  | creates AgentTurn
  v
TurnRunner
  |
  | calls LLM, receives tool calls
  v
ToolPolicy
  |
  | allow / ask / deny
  v
ToolRegistry
  |
  | execute typed domain tool
  v
StorageController
```

Persistent state:

```text
ai_sessions
  ai_turns
    ai_steps
```

Runtime state:

```text
current session
current turn
message queue
pending confirmation
compacted memory summary
```

## Hook Architecture (foundation for several phases)

Borrowed from Chelsea (`Chelsea/AI/Agent/AIAgentHooks.swift`). Several upcoming phases (3 policy, 8 compaction, plus future dedup / hallucination guards / paywall-equivalents) are easier to implement as **hooks composed around the turn loop** than as branches inside it. The hook chain is introduced once, then each phase plugs in.

### The hook surface

```ts
export type AgentContext = {
  turn: AgentTurn
  messages: MessageLLM[]
  pendingToolCalls: ToolCallLLM[]
  /** mutable: hooks may append or stop further processing */
}

export type BeforeToolCallHook = (ctx: AgentContext, call: ToolCallLLM) => Promise<{action: "pass" | "skip"; reason?: string}>

export type AfterToolCallHook = (ctx: AgentContext, call: ToolCallLLM, result: ToolResult) => Promise<void>

export type TransformContextHook = (messages: MessageLLM[]) => MessageLLM[]
```

The loop calls each hook in registered order:

1. Before sending messages to the LLM: run `TransformContextHook` chain (compaction, history trimming).
2. After receiving tool calls: for each call, run `BeforeToolCallHook` chain.
3. After tool execution: run `AfterToolCallHook` chain.

### Concrete hooks in scope

| Hook                   | Phase  | Purpose                                                                                 |
| ---------------------- | ------ | --------------------------------------------------------------------------------------- |
| `historyCompactorHook` | 8      | Replace old turns with deterministic summary                                            |
| `policyHook`           | 3      | Suspend on `isDestructive` tools until user confirms                                    |
| `dedupHook`            | future | Drop identical sibling tool calls (Chelsea `AIDedupHook` — DeepSeek failure-mode guard) |
| `respondInvariantHook` | 4      | Validate that turn ends with a `respond` call, not plain content                        |

Each hook is independently testable. Adding a new safety guard does not require touching the loop body.

### Why introduce this BEFORE Phase 1

Phase 1 (mutex + snapshot rollback) is logically prior, but Phase 1 by itself touches the loop's outer shape. Introducing the hook chain at the same time prevents a future refactor that would re-touch the same code. Implement them in one milestone, not sequentially. See revised "Recommended Execution Order" at the end of this document.

## Phase 1: Stabilize Runtime Execution

### Goal

Make the current system safe from corrupted history and concurrent turn execution before larger refactors.

### Status

**Not started** (as of 2026-06-06).

The earlier version of this section listed Phase 1 as "partially implemented" with checkmarks, but a code audit (`grep`/`Read` against `src/main/ai/AIController.ts`) confirms none of it landed:

- `sendMessage` has no concurrency guard. `AsyncMutex` exists in `src/main/utils/AsyncMutex.ts` but is used only by `SyncEngine`.
- Rollback is still `this.conversationHistory.pop()` (single-item) at `AIController.ts:212`. Snapshot-based rollback is not implemented.
- `cancel()` nulls `abortController` synchronously, before the turn finishes — does not wait for cleanup.
- `tests/main/ai/` directory is empty. None of the Phase 1 tests exist.

Treat the rest of this phase as a fresh implementation, not a finishing pass.

### Impact of MCP work (added 2026-06-05)

`src/main/mcp/` introduces a second consumer of `ToolExecutor.execute` running inside the same Electron main process. SQLite serializes writes at the DB layer, so two concurrent calls from the in-app assistant and an MCP client cannot corrupt storage. **However:**

- `conversationHistory` is still mutated without a lock. The risk surface remains the user double-submitting a message, not MCP. Phase 1 still needs to be done.
- The in-app assistant and the MCP server now share `ToolExecutor`. Make sure Phase 1's mutex only guards conversation state, NOT the executor — otherwise external MCP calls would block on internal AI turns.

### Files To Inspect First

- `src/main/ai/AIController.ts`
- `src/main/setup/ipc/ai.ts`
- `src/renderer/src/stores/ai/ai.store.ts`
- `src/main/utils/AsyncMutex.ts`

### Tasks

1. Add a main-process execution guard around `AIController.sendMessage`.
   - Prefer using the existing `AsyncMutex` if it fits.
   - If `AsyncMutex` is unsuitable, add a small AI-specific mutex.
   - The lock must cover the full user turn, including all model calls and tool calls.

2. Decide initial queue behavior.
   - Recommended first version: reject concurrent messages with a clear error.
   - Later phases can add a proper queue.
   - Error example: `AI assistant is already processing a message`.

3. Make cancellation turn-scoped.
   - `cancel()` should only abort the current turn.
   - After cancellation, `abortController` must be cleared.
   - A cancelled turn must not leave partial assistant/tool messages in history.

4. Replace one-item rollback with snapshot rollback.
   - At the start of `sendMessage`, save `historyStartIndex = this.conversationHistory.length`.
   - On thrown error or cancellation, truncate history back to that index.
   - Do not call `pop()` blindly.

5. Add a `finally` cleanup path.
   - Clear `abortController`.
   - Release mutex.
   - Clear any current-turn pointer if introduced.

6. Add focused tests.
   - If direct `AIController` construction is difficult, introduce test seams for mock clients.
   - Keep tests close to behavior, not implementation details.

### Suggested Implementation Shape

```ts
async sendMessage(userMessage: string): Promise<AIResponse> {
  return this.sendMutex.runExclusive(async () => {
    const historyStartIndex = this.conversationHistory.length
    this.abortController = new AbortController()

    try {
      // existing turn loop
    } catch (error) {
      this.conversationHistory.length = historyStartIndex
      // existing error mapping
    } finally {
      this.abortController = null
    }
  })
}
```

Adapt this to the actual `AsyncMutex` API.

### Tests

Add tests under one of:

- `tests/main/ai/AIController.test.ts`
- `tests/main/ai/runtime.test.ts`

Cover:

- One successful user turn with a model response and no tools.
- One successful user turn with one tool call and final answer.
- LLM error rolls history back to the start of the turn.
- Tool error is returned to the model as a tool result and does not crash the loop.
- Abort returns `Request cancelled` and rolls back partial history.
- Concurrent `sendMessage` is rejected or serialized according to the chosen behavior.

### Done Criteria

- No path uses `conversationHistory.pop()` for rollback.
- Two concurrent IPC `ai:send-message` calls cannot interleave one shared history.
- Cancelled requests leave no partial assistant/tool messages in history.
- Tests cover success, failure, cancel, and concurrency behavior.

## Phase 2: Introduce Tool Registry

### Goal

Create one source of truth for tool metadata, schemas, risk flags, and execution functions. This reduces drift between `tools.jsonl`, `tools-compact.jsonl`, `ToolName`, `ToolExecutor`, and (since 2026-06-05) the MCP registry.

This phase does not add external plugins. It only organizes built-in Daily tools.

### Impact of MCP work (now blocking)

Before MCP, the only consumer of `AI_TOOLS` was the in-app assistant. Drift was an aesthetic concern. After MCP, there are TWO consumers:

- `AI_TOOLS` / `AI_TOOLS_COMPACT` in `src/main/ai/tools/tools.ts` — internal assistant.
- `buildMcpToolRegistry()` in `src/main/mcp/tools/registry.ts` — MCP server (filters out hard-destructive tools).

Both read the same `tools.jsonl` but apply transformations independently. Adding a new tool today requires updating `tools.jsonl`, the manual switch in `ToolExecutor.execute`, the `ToolName` union, AND remembering whether MCP should expose it. **Phase 2 is no longer "nice to have" — without it, the system drifts.**

### Files To Inspect First

- `src/main/ai/tools/tools.ts`
- `src/main/ai/tools/tools.jsonl`
- `src/main/ai/tools/tools-compact.jsonl`
- `src/main/ai/tools/types.ts`
- `src/main/ai/tools/ToolExecutor.ts`
- `src/main/ai/AIController.ts`

### New Files

Suggested:

- `src/main/ai/tools/registry.ts`
- `src/main/ai/tools/definitions.ts`
- `src/main/ai/tools/categories/taskTools.ts`
- `src/main/ai/tools/categories/projectTools.ts`
- `src/main/ai/tools/categories/tagTools.ts`
- `src/main/ai/tools/categories/attachmentTools.ts`
- `src/main/ai/tools/categories/summaryTools.ts`

### Types

Define a registry entry:

```ts
export type RegisteredTool<TParams = Record<string, unknown>, TResult = ToolResult> = {
  name: string
  description: string
  compactDescription?: string
  parameters: Tool["function"]["parameters"]
  compactParameters?: Tool["function"]["parameters"]
  /**
   * Whether the tool modifies state (writes to SQLite, mutates settings, etc).
   * Used by paywall/quota hooks and to require explicit acknowledgement.
   */
  isWrite: boolean
  /**
   * Whether the tool is destructive and requires explicit user confirmation
   * at runtime (not via the system prompt).
   */
  isDestructive: boolean
  execute(params: TParams, ctx: ToolExecutionContext): Promise<TResult>
}

export type ToolExecutionContext = {
  storage: StorageController
  now: () => Date
}
```

Two booleans, not a four-level enum. Borrowed from Chelsea's `AIAgentTool` protocol (`Chelsea/AI/Agent/AIAgentTool.swift:74`). Four combinations of `isWrite` × `isDestructive` cover the entire risk palette (`!isWrite && !isDestructive` = read, `isWrite && !isDestructive` = create/update, `isWrite && isDestructive` = soft-delete, etc.) and are simpler to reason about than `"read" | "write" | "destructive" | "permanent_destructive"`. The MCP block-list maps cleanly to "expose iff `!isDestructive || tool is recoverable` ".

Do not over-engineer generics in the first pass. The practical win is centralized metadata.

### Tasks

1. Create a registry containing every current tool.
   - Keep behavior identical.
   - Move implementations gradually if needed.
   - It is acceptable to wrap the current `ToolExecutor` temporarily.

2. Generate OpenAI tool definitions from the registry.
   - `AI_TOOLS` uses full descriptions/schemas.
   - `AI_TOOLS_COMPACT` uses compact descriptions/schemas when present.
   - If compact metadata is missing, fall back to full metadata.

3. Derive `ToolName` from registry.
   - Avoid maintaining a manual union.
   - Example:
     ```ts
     export type ToolName = (typeof REGISTERED_TOOLS)[number]["name"]
     ```

4. Replace the switch dispatcher.
   - `ToolExecutor.execute(name, params)` should find a registry entry and call `entry.execute`.
   - Unknown tool returns a clear error.

5. Remove or deprecate JSONL source files after generated definitions are stable.
   - If build tooling makes raw imports easier for now, leave JSONL temporarily but add tests that detect drift.
   - Final target is no JSONL drift.

### Migration Strategy

Prefer a low-risk two-step migration:

1. Registry wraps existing private methods inside `ToolExecutor`.
2. Once tests pass, split methods into category files.

This avoids moving hundreds of lines before behavior is protected.

### Tests

Add `tests/main/ai/tools/registry.test.ts`.

Cover:

- Every registered tool has a unique name.
- Every registered tool has `parameters.type === "object"`.
- Required fields exist in `properties`.
- Every registered tool has a risk level.
- Generated full and compact tool lists are non-empty.
- Generated tool names match executor availability.

### Done Criteria

- There is one canonical list of built-in tools.
- Tool schemas are generated from registry entries.
- Tool execution dispatch no longer depends on a long switch statement.
- Tests fail if schema/executor metadata drifts.

## Phase 3: Add Tool Policy And Confirmations

### Goal

Move destructive-action safety from prompt instructions into deterministic code.

The model may request a destructive tool, but the runtime decides whether it can execute.

### Architectural simplification (Chelsea-derived)

The earlier draft of this phase introduced a `PolicyDecision = "allow" | "deny" | "ask"` enum and a separate `ToolPolicy` subsystem. A simpler shape from Chelsea (`AIAgent.swift:366-394` + `AIAgentHooks.swift`) collapses both:

- **Policy = a `beforeToolCall` hook** in the loop's hook chain (see "Hook Architecture" section). The hook reads `tool.isDestructive` and decides whether to suspend or pass through. No separate `PolicyDecision` enum required.
- **Confirmation = `Promise`-based suspension** of the loop, awaiting a UI event with a timeout. JS port: `new Promise<boolean>((resolve) => { pendingConfirmation = {resolve, timeoutId}; })`. UI clicks "confirm"/"cancel" → resolve the promise → loop resumes with the boolean. 30-second timeout auto-resolves to `false`.

This eliminates two abstractions (the `PolicyDecision` enum and the `ToolPolicy` class) by reusing the hook chain. Everything described in the original Phase 3 (risk levels, pending confirmations, IPC handlers, UI cards) still applies — just expressed through hooks and Promises instead of new types.

The destructive-tool blocklist for MCP (already in `src/main/mcp/constants.ts`) stays orthogonal: MCP filters at registration time, in-app confirmation gates at execution time. Both can coexist.

### Files To Inspect First

- `src/main/ai/AIController.ts`
- `src/main/ai/tools/ToolExecutor.ts`
- `src/main/ai/tools/registry.ts`
- `src/main/setup/ipc/ai.ts`
- `src/main/preload.ts`
- `src/shared/types/ai.ts`
- `src/renderer/src/stores/ai/ai.store.ts`
- `src/renderer/src/ui/views/Assistant/AssistantView.vue`
- `src/renderer/src/ui/views/Assistant/{fragments}/ChatMessage.vue`

### New Files

Suggested:

- `src/main/ai/policy/ToolPolicy.ts`
- `src/main/ai/policy/types.ts`
- `src/main/ai/policy/confirmationPreview.ts`

### Types

```ts
export type PolicyDecision = {type: "allow"} | {type: "deny"; reason: string} | {type: "ask"; confirmation: PendingToolConfirmation}

export type PendingToolConfirmation = {
  id: string
  toolName: ToolName
  params: Record<string, unknown>
  riskLevel: ToolRiskLevel
  title: string
  summary: string
  details?: string[]
  createdAt: number
}
```

Extend shared AI types:

```ts
export type AIResponse = {
  success: boolean
  message?: AIMessage
  error?: string
  pendingConfirmation?: PendingToolConfirmation
}
```

If sharing `ToolName` into `shared` creates import problems, define a serializable shared confirmation shape with `toolName: string`.

### Default Policy

Start simple:

| Risk Level              | Decision |
| ----------------------- | -------- |
| `read`                  | allow    |
| `write`                 | allow    |
| `destructive`           | ask      |
| `permanent_destructive` | ask      |

Initial risk mapping:

- `read`
  - `list_tasks`
  - `get_task`
  - `get_deleted_tasks`
  - `search_tasks`
  - `list_projects`
  - `get_day_summary`
  - `get_task_attachments`
  - `list_tags`
  - `get_tag`
- `write`
  - `create_task`
  - `update_task`
  - `complete_task`
  - `discard_task`
  - `reactivate_task`
  - `add_task_tags`
  - `remove_task_tags`
  - `move_task`
  - `move_task_to_project`
  - `log_time`
  - `create_project`
  - `rename_project`
  - `switch_project`
  - `create_tag`
  - `update_tag`
  - `restore_task`
- `destructive`
  - `delete_task`
  - `delete_project`
  - `remove_task_attachment`
  - `delete_tag`
- `permanent_destructive`
  - `permanently_delete_task`

### Runtime Behavior

When a tool call arrives:

1. Validate tool arguments.
2. Evaluate policy.
3. If `allow`, execute normally.
4. If `deny`, append a tool result error and continue or stop with a blocked message.
5. If `ask`:
   - Do not execute the tool.
   - Store pending confirmation in `AIController`.
   - Return an assistant response that asks the user to confirm.
   - Set turn status to `waiting_confirmation` once turn model exists.

### Confirmation Execution

Add IPC handlers:

- `ai:confirm-tool-call`
- `ai:cancel-tool-call`

Suggested main-process methods:

```ts
confirmPendingToolCall(confirmationId: string): Promise<AIResponse>
cancelPendingToolCall(confirmationId: string): Promise<boolean>
```

For the first version, confirmation can execute the single pending tool and return a short assistant message. Later, the runtime can resume the original LLM loop after the confirmed tool result.

### UI Behavior

Renderer store should expose:

- `pendingConfirmation`
- `confirmPendingToolCall()`
- `cancelPendingToolCall()`

Assistant UI should show a confirmation card with:

- Tool action title.
- Summary.
- Optional details.
- Confirm button.
- Cancel button.

Do not rely on the model to phrase the safety question correctly. Use the structured confirmation object.

### Tests

Add `tests/main/ai/policy/ToolPolicy.test.ts` and update controller tests.

Cover:

- Read tools are allowed.
- Write tools are allowed.
- Destructive tools return `ask`.
- Permanent destructive tools return `ask`.
- Unknown tools are denied.
- `delete_task` is not executed until confirmation.
- Confirmed tool executes exactly once.
- Cancelled confirmation does not execute.

### Done Criteria

- No destructive tool can execute directly from a model tool call.
- UI receives a structured confirmation object.
- Confirm and cancel paths work.
- Tests prove destructive tools are gated by runtime policy.

## Phase 4: Introduce Turn Model

### Goal

Represent each user request as a first-class execution turn rather than mutating a flat message array.

This makes rollback, retry, debugging, durable persistence, and UI progress easier.

### Required pattern: `tool_choice: "required"` on the first iteration + explicit `respond` tool

Borrowed from Chelsea (`AIAgentLoop.swift:74` + `AIAgentTool/AIRespondTool.swift`). The current `AIController.sendMessage` allows the model to return plain `assistant.content` as a final answer. This creates a documented failure mode in Daily today: the model says "Done, created task" without actually calling `create_task`. The current workaround is the `requireVisibleFinalAnswer` second-system-prompt hack at `AIController.ts:144-156`, which is fragile and noisy.

The Chelsea pattern eliminates this **architecturally**:

1. On iteration 0, set `tool_choice: "required"`. The model MUST call a tool — it cannot return plain content.
2. Add an explicit `respond({text: string})` tool to the registry. This is how the model communicates user-visible text.
3. On subsequent iterations (when the model has produced at least one write), relax to `tool_choice: null`.

Result: all model-to-user communication flows through structured tools. Plain `assistant.content` is ignored / treated as a protocol violation. The `requireVisibleFinalAnswer` workaround is deleted. The hallucination class of bugs ("said done but didn't do anything") becomes impossible by construction.

Adopt this at the same time as the turn model, since it changes the shape of an `AgentStep`. A `respond` tool call is `step.type = "tool_call"` with `toolName = "respond"`, not a `model_response` step with content.

### Files To Inspect First

- `src/main/ai/AIController.ts`
- `src/main/ai/types.ts`
- `src/shared/types/ai.ts`
- `src/renderer/src/stores/ai/ai.store.ts`

### New Files

Suggested:

- `src/main/ai/turns/types.ts`
- `src/main/ai/turns/TurnBuilder.ts`
- `src/main/ai/turns/messageProjection.ts`

### Types

```ts
export type AgentTurnStatus = "running" | "completed" | "failed" | "cancelled" | "waiting_confirmation"

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

export type AgentStep =
  | {
      id: string
      type: "model_response"
      createdAt: number
      message: MessageLLM
    }
  | {
      id: string
      type: "tool_call"
      createdAt: number
      toolCallId: string
      toolName: string
      params: unknown
    }
  | {
      id: string
      type: "tool_result"
      createdAt: number
      toolCallId: string
      toolName: string
      result: unknown
    }
  | {
      id: string
      type: "confirmation_request"
      createdAt: number
      confirmation: PendingToolConfirmation
    }
  | {
      id: string
      type: "error"
      createdAt: number
      message: string
    }
```

### Tasks

1. Add `TurnBuilder`.
   - Creates a turn.
   - Appends steps.
   - Marks final status.
   - Produces a renderer `AIMessage`.

2. Modify `sendMessage`.
   - Create a turn at the beginning.
   - Record every assistant model response as `model_response`.
   - Record every tool call and tool result.
   - Record confirmation request if policy returns `ask`.
   - Record errors/cancel.

3. Keep existing renderer contract initially.
   - `sendMessage` can still return `AIResponse`.
   - Do not force UI rewrite in this phase.

4. Add message projection.
   - Convert turns/history into `MessageLLM[]` for the next model call.
   - Initially this can still use `conversationHistory`.
   - Final target: build LLM history from turns plus compaction summary.

5. Implement retry from turn.
   - Renderer currently retries by removing the last user message.
   - Main process should eventually own retry semantics.
   - First version can expose `ai:retry-last-turn` later if needed.

### Tests

Cover:

- A no-tool response produces one completed turn.
- A tool response produces model/tool/result/final steps.
- Failed model call produces failed turn with error step.
- Cancelled turn status is `cancelled`.
- Confirmation request turn status is `waiting_confirmation`.

### Done Criteria

- Every user request produces an `AgentTurn`.
- Tool calls/results are visible as structured steps.
- Existing UI still works.
- Rollback/cancel can operate at turn level.

## Phase 5: Persist Durable Sessions

### Goal

Persist assistant sessions, turns, and steps so conversations survive app restarts and can be audited/debugged.

### Files To Inspect First

- `src/main/storage/database/migrations/index.ts`
- `src/main/storage/database/migrations/v001-initial-schema.ts`
- `src/main/storage/models/*`
- `src/main/storage/services/*`
- `src/main/storage/StorageController.ts`
- `tests/main/storage/migrations.test.ts`

### New Files

Suggested:

- `src/main/storage/database/migrations/v004-ai-sessions.ts`
- `src/main/storage/models/AISessionModel.ts`
- `src/main/storage/services/AISessionService.ts`
- `tests/main/storage/models/AISessionModel.test.ts`
- `tests/main/storage/services/AISessionService.test.ts`

### Schema

SQLite tables:

```sql
CREATE TABLE ai_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  provider TEXT,
  model TEXT,
  prompt_tier TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE ai_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  status TEXT NOT NULL,
  final_message TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
);

CREATE TABLE ai_steps (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (turn_id) REFERENCES ai_turns(id) ON DELETE CASCADE
);
```

Use the project's existing timestamp conventions. If the storage layer uses ISO strings elsewhere, use ISO strings here too.

### Tasks

1. Add migration.
   - Include indexes:
     - `ai_turns(session_id, started_at)`
     - `ai_steps(turn_id, created_at)`
   - Update migration tests.

2. Add model/service.
   - `createSession`
   - `getActiveSession`
   - `archiveSession`
   - `createTurn`
   - `updateTurn`
   - `appendStep`
   - `getSessionWithTurns`

3. Wire into `StorageController`.
   - Expose methods needed by `AIController`.
   - Keep naming consistent with existing storage services.

4. Persist turns during execution.
   - On turn start: insert session if needed, insert turn.
   - On each step: append step.
   - On finish: update turn status/final/error.

5. Restore current session in renderer.
   - Add IPC:
     - `ai:get-current-session`
     - optionally `ai:list-sessions`
   - First version can load only current session messages.

6. Update `clearHistory`.
   - Archive current session or create a new empty session.
   - Do not physically delete history unless user requests it.

### Tests

Cover:

- Migration creates tables.
- Session can be created and loaded.
- Turn can be created and updated.
- Steps preserve JSON payload.
- Archive session hides it from active-session loading.

### Done Criteria

- Assistant conversation survives app restart.
- Tool steps are persisted.
- Clear history does not necessarily destroy audit data.
- Storage tests cover schema and service behavior.

## Phase 6: Structured Tool Results

### Goal

Stop using one human-readable string as the only representation of tool results. Return structured data for the runtime/UI and a compact summary for the model.

### Files To Inspect First

- `src/main/ai/tools/types.ts`
- `src/main/ai/tools/ToolExecutor.ts`
- `src/main/ai/AIController.ts`
- `src/shared/types/ai.ts`

### Type

```ts
export type ToolResult = {
  success: boolean
  summary: string
  data?: unknown
  changedEntities?: ChangedEntity[]
  error?: string
}

export type ChangedEntity = {
  type: "task" | "tag" | "project" | "file"
  id: string
  action: "created" | "updated" | "deleted" | "restored" | "moved"
}
```

### Tasks

1. Update `ToolResult` type.
   - Keep a compatibility helper if too many call sites expect `data`.
   - During migration, support both `summary` and legacy `data` carefully.

2. Add formatters.
   - `toModelToolMessage(result: ToolResult): string`
   - `toRendererToolCall(result: ToolResult): {name: string; result: string}`
   - `toLogPayload(result: ToolResult): unknown`

3. Update every tool.
   - Read tools include structured `data` where useful.
   - Write tools include `changedEntities`.
   - Error tools set `success: false`, `summary`, and `error`.

4. Update `AIController`.
   - Push model-facing tool result via formatter.
   - Store structured result in turn step.
   - Return renderer-friendly summary in `AIMessage.toolCalls`.

### Examples

Create task result:

```ts
{
  success: true,
  summary: "Task created: buy milk on 2026-05-23 at 17:00",
  data: {task},
  changedEntities: [{type: "task", id: task.id, action: "created"}]
}
```

Delete tag result:

```ts
{
  success: true,
  summary: "Tag deleted: Work",
  data: {tagId},
  changedEntities: [{type: "tag", id: tagId, action: "deleted"}]
}
```

### Tests

Cover:

- Each write tool reports changed entities.
- Each read tool has a useful summary.
- Model formatter does not expose excessive data.
- Renderer formatter remains backwards-compatible.

### Done Criteria

- Tool results are structured.
- Model messages remain concise.
- UI can identify changed entities without parsing strings.

## Phase 7: Add Event Stream

### Goal

Expose live agent progress to the renderer and improve observability.

### Files To Inspect First

- `src/main/setup/ipc/ai.ts`
- `src/main/preload.ts`
- `src/renderer/src/stores/ai/ai.store.ts`
- `src/renderer/src/ui/views/Assistant/AssistantView.vue`
- `src/renderer/src/ui/views/Assistant/{fragments}/ChatMessage.vue`

### Event Types

Shared type:

```ts
export type AIEvent =
  | {type: "turn_started"; turnId: string; userMessage: string}
  | {type: "model_requested"; turnId: string; iteration: number}
  | {type: "model_responded"; turnId: string; hasToolCalls: boolean}
  | {type: "tool_started"; turnId: string; toolCallId: string; toolName: string}
  | {type: "tool_finished"; turnId: string; toolCallId: string; toolName: string; success: boolean; summary: string}
  | {type: "confirmation_required"; turnId: string; confirmation: PendingToolConfirmation}
  | {type: "turn_finished"; turnId: string; finalMessage: string}
  | {type: "turn_failed"; turnId: string; error: string}
  | {type: "turn_cancelled"; turnId: string}
```

### Tasks

1. Add event broadcaster dependency to `AIController`.
   - Constructor can accept `(event: AIEvent) => void`.
   - Main setup wires it to assistant window `webContents.send`.

2. Emit events from the turn loop.
   - Do not emit sensitive full prompts by default.
   - Tool params should be summarized, not dumped.

3. Add preload listeners.
   - `ai:on-event`
   - Return unsubscribe function if current preload conventions support it.

4. Update Pinia store.
   - Track current turn progress.
   - Add tool status list.
   - Track confirmation state from event.

5. Update UI.
   - Show live tool calls.
   - Show confirmation card.
   - Show failed/cancelled state clearly.

### Done Criteria

- User sees progress before final answer.
- Tool execution status is visible.
- Confirmation UI is driven by structured runtime event.
- Event payloads do not include full private prompt/history by default.

## Phase 8: Add Compaction

### Goal

Prevent long sessions from overflowing model context and reduce repeated irrelevant history.

### Why Daily needs deterministic summary (and Chelsea's `suffix(N)` would be wrong here)

Chelsea (`Chelsea/AI/Agent/Hooks/AIHistoryCompactorHook.swift`) uses `messages.suffix(30)` — a sliding-window. That is correct **for Chelsea's domain**: expense-tracker intents are short (3-5 turns) and clear on resolution. A session never grows past ~30 messages naturally.

Daily is different. A user opens the assistant to plan their week, asks about today, asks about yesterday, queries deleted tasks, batches several creates and moves — all in one session. No automatic "intent resolution" boundary clears the history. Sessions are long-running by design.

Sliding-window does not fit Daily because:

- Pairs of `assistant.tool_calls` and matching `tool` results MUST stay together. A naive `suffix(N)` can slice between them and produce 400-invalid LLM requests.
- Important domain facts ("user created tag Work", "user moved tasks to project X") need to survive even when the messages that produced them are dropped.

The original Phase 8 design (deterministic summary extracted from turn-step `changedEntities` + user messages) is the right approach for Daily. Keep it. The note here is for future-self: **do not regress to a sliding-window because Chelsea uses one**.

### Files To Inspect First

- `src/main/ai/AIController.ts`
- `src/main/ai/promts/*`
- `src/main/ai/turns/messageProjection.ts`
- AI session storage from Phase 5

### New Files

Suggested:

- `src/main/ai/memory/ConversationCompactor.ts`
- `src/main/ai/memory/types.ts`
- `src/main/ai/memory/deterministicSummary.ts`

### Initial Strategy

Start with deterministic compaction, not LLM-generated compaction.

Why:

- Easier to test.
- No extra model cost.
- No risk of invented summaries.
- Daily's domain data is structured enough to summarize tool changes.

### Compaction Input

Old completed turns:

- user message
- final message
- tool result summaries
- changed entities
- unresolved confirmations

### Compaction Output

```ts
export type AgentMemorySummary = {
  generatedAt: string
  coveredTurnIds: string[]
  text: string
  importantEntities: Array<{
    type: "task" | "tag" | "project" | "file"
    id: string
    label?: string
  }>
}
```

### Message Projection

When calling the LLM, include:

1. System prompt.
2. Memory summary system message, if available.
3. Recent turns only.

Example memory message:

```text
Session memory summary:
- User created task "buy milk" for 2026-05-23 17:00.
- User moved task abc123 to project Work.
- Last active project mentioned: Work (project id: xyz).
```

### Trigger Rules

Initial simple thresholds:

- Keep last 8 turns uncompressed.
- Compact older turns when total projected characters exceed a conservative limit.
- Use different thresholds by prompt tier:
  - tiny: lower threshold
  - medium: moderate threshold
  - large: higher threshold

### Tasks

1. Implement deterministic summary.
2. Store summary in session.
   - Either as a special `ai_steps` row or a new `ai_session_summaries` table.
   - Prefer a special step first unless queries become awkward.
3. Update message projection.
4. Add manual compaction method for debugging:
   - IPC can be added later.
   - Internal method is enough first.
5. Add tests.

### Tests

Cover:

- Old turns are summarized.
- Recent turns remain verbatim.
- Unresolved confirmations are preserved.
- Important changed entities are included.
- Message projection includes summary plus recent turns.

### Done Criteria

- Long sessions can be projected into bounded model context.
- Summary is deterministic and testable.
- Full raw turns remain persisted.

## Phase 9: Add Eval Harness

### Goal

Make agent behavior measurable and regression-resistant.

### No baseline from Chelsea

A check of Chelsea's test suite (June 2026) confirmed there is no mock LLM client and no agent-loop test coverage. Existing Chelsea tests (`ChelseaTests/TextCaptureOrchestratorTests.swift`, `ChelseaTests/MockParserTests.swift`) cover the pre-agent text-parsing pipeline, not `runAIAgentLoop`. Daily cannot port test scaffolding — `MockLLMClient`, scripted scenarios, helper for asserting tool sequences must all be built from scratch.

This makes Phase 9 the only phase in the roadmap that has no Chelsea-derived shortcut. Plan accordingly: budget time for inventing the test infrastructure, not just writing scenarios on top of it.

### Files To Inspect First

- `tests/helpers/db.ts`
- `tests/main/storage/services/*`
- `tests/main/storage/models/*`
- `vitest.config.ts`

### New Files

Suggested:

- `tests/main/ai/helpers/mockAiClient.ts`
- `tests/main/ai/helpers/agentFixture.ts`
- `tests/main/ai/evals/task-agent.eval.test.ts`

### Mock LLM

Create a fake client implementing `IAiClient`.

It should:

- Receive messages and tools.
- Return scripted assistant messages.
- Assert that expected tools are present.
- Optionally inspect prompt/history.

Example script:

```ts
const client = new ScriptedAiClient([
  {
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "create_task",
          arguments: {content: "buy milk", date: "2026-05-23", time: "17:00"},
        },
      },
    ],
  },
  {
    content: "Done: created task. Result: buy milk scheduled for 2026-05-23 at 17:00.",
  },
])
```

### Core Eval Scenarios

1. Create task with date/time.
   - Input: `Add buy milk tomorrow at 5pm`.
   - Expected: one task created with correct date/time.

2. List today.
   - Input: `What do I have today?`
   - Expected: `list_tasks` called with today's date or default behavior.

3. Complete high-confidence task.
   - Seed two tasks with clearly different names.
   - Input: `Mark buy milk done`.
   - Expected: discovery then completion of correct task.

4. Ambiguous task asks clarification.
   - Seed two similar tasks.
   - Input: `Mark meeting done`.
   - Expected: no status change; assistant asks user to choose.

5. Destructive action requires confirmation.
   - Input: `Delete the buy milk task`.
   - Expected: pending confirmation; no deletion before confirm.

6. Permanent deletion requires confirmation.
   - Input: `Permanently delete task abc`.
   - Expected: strict confirmation; no delete before confirm.

7. Batch partial failure.
   - One valid task id, one invalid task id.
   - Expected: successful item and failed item are reported separately.

8. Tag creation and assignment.
   - Input: `Create Work tag and add it to report task`.
   - Expected: tag created, task updated.

9. Project move.
   - Input: `Move report task to Work project`.
   - Expected: project discovery then task branch update.

10. Cancel.
    - Input starts long-running fake model/tool path.
    - Expected: cancelled turn, no partial persisted state.

### Optional Live Evals

Add a script later:

```text
pnpm ai:eval:live
```

Live evals should:

- Require explicit env/API key.
- Not run in normal CI.
- Use a disposable test database.
- Print scenario pass/fail with transcript links.

### Done Criteria

- Mock evals run in normal test suite.
- Policy and turn behavior are covered.
- Prompt/runtime changes can be validated without manual app testing.

## Phase 10: Clean Up Prompt And Logging

### Goal

After runtime safety exists in code, simplify prompts and reduce sensitive logging.

### Files To Inspect First

- `src/main/ai/promts/getSystemPrompt.ts`
- `src/main/ai/promts/getSystemPromptCompact.ts`
- `src/main/ai/promts/getSystemPromptTiny.ts`
- `src/main/ai/clients/common/OpenAiCompatibleClient.ts`
- `src/main/ai/tools/ToolExecutor.ts`
- `src/main/utils/logger.ts`

### Tasks

1. Remove safety rules from prompt that are now enforced by policy.
   - Keep user-facing behavior guidance.
   - Do not rely on prompt for destructive gating.

2. Add prompt instructions for structured tool result interpretation.
   - Tell the model to use tool result summaries.
   - Tell it not to invent changed entities.

3. Reduce sensitive logging.
   - Do not log full `messages` by default.
   - Do not log full task content unless debug mode explicitly enables it.
   - Log counts, tool names, and ids where possible.

4. Add redaction helper.
   - `redactAiMessagesForLog(messages)`
   - `redactToolParamsForLog(toolName, params)`

5. Add tests for redaction helpers.

### Done Criteria

- Prompt is shorter and delegates safety to runtime policy.
- Normal logs do not contain full user task content or full prompts.
- Debug logging can still be enabled deliberately during development.

## Recommended Execution Order

Revised 2026-06-06 after MCP shipped and Chelsea was studied. Use this order unless a production bug requires jumping ahead:

1. **Phase 2 (Tool Registry) — now first.** MCP made the parallel-consumer drift active. Single registry consumed by both `ToolExecutor` and `McpToolRegistry` is the foundation everything else builds on.
2. **Phase 1 (Runtime Stabilization) + Hook Architecture together.** Mutex, snapshot rollback, AND the `BeforeToolCallHook`/`AfterToolCallHook`/`TransformContextHook` chain in one pass. Doing Phase 1 without the hook chain means re-touching loop internals later.
3. **Phase 3 (Tool Policy) as a hook.** Once hook chain exists, the policy is a ~50-line `beforeToolCallHook` + a Promise-based confirmation primitive. Much smaller than the original spec.
4. **Phase 4 (Turn Model) + `tool_choice: required` + `respond` tool.** Adopt the Chelsea hallucination-by-construction fix in the same phase that introduces turn entities. Delete `requireVisibleFinalAnswer` workaround.
5. **Phase 6 (Structured Tool Results).** Best done alongside Phase 4 so AgentStep can carry the structured `ToolResult` from the start.
6. **Phase 5 (Durable Sessions).** Persistence comes after the types are stable.
7. **Phase 7 (Event Stream).** Live progress to the renderer.
8. **Phase 8 (Compaction) — deterministic summary as a `TransformContextHook`.** Plug into the existing hook chain.
9. **Phase 9 (Eval Harness).** Has the highest no-baseline cost (Chelsea cannot help). Worth doing late, once the agent shape is stable enough to be worth pinning down.
10. **Phase 10 (Prompt + Logging Cleanup).** Last, once everything else is enforced in code.

Reasoning for the reorder:

- **Phase 2 moved to #1** because MCP made it a drift problem, not a polish item.
- **Phase 1 + hooks bundled** because they touch the same loop code. Doing them sequentially means rewriting the same file twice.
- **Phase 3 collapsed onto hooks** because once the chain exists, "policy" is just one hook implementation. Eliminates a planned subsystem.
- **Phase 4 carries the `respond` tool** because the dual-channel hallucination problem is a today-bug, not a future concern. Delaying it means living with `requireVisibleFinalAnswer` longer.
- **Phase 9 last (not earlier as originally suggested)** — original order said "Evals can start earlier, but more useful once policy and turns exist." Confirmed: Chelsea has no eval harness to inherit, so the cost to build from zero is real. Save it for when the agent shape is stable.

## Suggested Milestones

Revised 2026-06-06 to match the new execution order.

### Milestone A: Foundation

Includes:

- Phase 2 (Tool Registry — single source of truth, `isWrite`/`isDestructive` flags)
- Phase 1 + Hook Architecture (mutex, snapshot rollback, `BeforeToolCallHook`/`AfterToolCallHook`/`TransformContextHook` chain)
- Phase 3 (Tool Policy as a `BeforeToolCallHook` + Promise-based confirmation)
- Minimal tests

Outcome:

- No more registry drift between in-app AI and MCP server.
- No concurrent-history corruption.
- No model-driven destructive actions without runtime confirmation (not prompt-only).
- Hook chain is in place; future safety guards plug in without touching loop code.

### Milestone B: Architecture-Level Hallucination Fix + Inspectable Turns

Includes:

- Phase 4 (Turn Model + `tool_choice: "required"` first iteration + `respond` tool)
- Phase 6 (Structured Tool Results — `changedEntities`, summary, structured data)

Outcome:

- Plain `assistant.content` no longer used as a communication channel. The `requireVisibleFinalAnswer` workaround is deleted.
- "Said done but didn't do anything" failures become impossible by construction.
- Every turn is a first-class entity with structured steps and structured tool results.

### Milestone C: Observable + Durable

Includes:

- Phase 5 (Durable Sessions — SQLite persistence of sessions/turns/steps)
- Phase 7 (Event Stream — live progress to renderer)

Outcome:

- Conversations survive app restart.
- UI shows live tool calls and confirmation cards driven by structured events.

### Milestone D: Bounded + Tested

Includes:

- Phase 8 (Compaction — deterministic summary as a `TransformContextHook`)
- Phase 9 (Eval Harness — from scratch, no Chelsea baseline)
- Phase 10 (Prompt + Logging Cleanup)

Outcome:

- Long sessions remain within LLM context limits with bounded cost.
- Agent behavior has regression tests against a mock LLM.
- Prompts delegate safety to runtime; logs do not contain full user task content or full prompts.

## Implementation Rules For Future Agents

Follow these rules when implementing this roadmap:

1. Keep behavior changes small per PR/commit.
2. Do not refactor renderer UI and main-process runtime in the same step unless required.
3. Add tests in the same phase as the runtime change.
4. Keep old IPC contracts working until renderer migration is complete.
5. Avoid deleting `tools.jsonl` until registry-generated schemas are tested.
6. Never rely on prompt text for destructive-action safety once policy exists.
7. Prefer structured types over parsing strings.
8. Keep full user/task content out of normal logs.
9. When adding persistence, use migrations and model/service patterns already present in `src/main/storage`.
10. Before each phase, inspect current code because earlier phases may have changed file boundaries.

## Phase Entry Checklist

Before starting any phase:

- Read the files listed in that phase.
- Check `git status`.
- Identify unrelated user changes and leave them untouched.
- Add or update tests that directly cover the phase's behavior.
- Run the narrowest relevant tests first.
- Run broader tests before finalizing if the phase touches shared storage/runtime code.

## Phase Exit Checklist

Before considering a phase complete:

- Done criteria are satisfied.
- New types are exported from the right layer only.
- Renderer still compiles.
- Main process still compiles.
- AI disabled state still behaves correctly.
- Local and remote provider paths are both considered.
- Cancellation behavior is tested if the phase touches turn execution.
- Existing task/project/tag behavior remains unchanged unless explicitly intended.
