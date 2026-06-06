# Tool Registry Implementation Plan (Phase 2)

> **For agentic workers:** Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSONL + switch-based tool system with a single typed registry that is the source of truth for tool metadata (name, description, schema, `isWrite`/`isDestructive` flags) and execution. Both the in-app `ToolExecutor` and the MCP server's `buildMcpToolRegistry` consume the same registry.

**Architecture:** A new `src/main/ai/tools/registry/` directory holds the registry. Tools are organized by category (tasks/tags/projects/files/summary). The existing JSONL files are deleted; `AI_TOOLS`/`AI_TOOLS_COMPACT`/`ToolName` are derived from the registry. `ToolExecutor.execute` becomes a thin dispatch wrapper. The MCP registry filters by a name list (`MCP_BLOCKED_TOOL_NAMES`), unchanged from current MCP code.

**Tech Stack:** TypeScript, no new dependencies. Existing patterns: `?raw` Vite imports stay (for tier-specific schema overrides) only if needed; otherwise inline.

**Spec source:** [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 2 section, as revised on 2026-06-06.

---

## Conventions

- **TDD where behavior-bearing**, mechanical task migrations don't all need a failing test first — but the final `registry.test.ts` (Task 9) is a guardrail.
- **Commit per task.** Commit messages: `refactor: …` for migrations, `feat: …` for net-new structure, `test: …` for test-only commits.
- **Test command:** `pnpm evitest run tests/main/<path>` for one file, `pnpm test:main` for the suite. NEVER `pnpm vitest` directly (Electron Node ABI requirement).
- **Path aliases:** `@/` → `src/main/`, `@shared/` → `src/shared/`, `@main/` → `src/main/` in tests.
- **Reference patterns:** see existing MCP work (`tests/main/mcp/`) for test style.

---

## File Structure (target)

```
src/main/ai/tools/
  registry/
    types.ts                   — RegisteredTool, ToolExecutionContext, ToolName, helpers
    index.ts                   — REGISTRY array, derived AI_TOOLS / AI_TOOLS_COMPACT / ToolName
    categories/
      taskTools.ts             — 14 tools (list, get, create, update, complete, discard,
                                  reactivate, delete, get_deleted, restore, permanently_delete,
                                  move, log_time, search)
      tagTools.ts              — 7 tools (list, get, create, update, delete, add_to_task, remove_from_task)
      projectTools.ts          — 6 tools (list, create, rename, delete, switch, move_task_to)
      fileTools.ts             — 2 tools (get_attachments, remove_attachment)
      summaryTools.ts          — 1 tool  (get_day_summary)
  ToolExecutor.ts              — thin dispatcher (calls registry[name].execute with caller ctx)
  tools.ts                     — DELETED (Task 8); imports migrate to @/ai/tools/registry
  tools.jsonl                  — DELETED (Task 10)
  tools-compact.jsonl          — DELETED (Task 10)
```

The existing `src/main/ai/tools/types.ts` (`ToolResult`, `ToolParams`) stays as-is; registry types live in `registry/types.ts` alongside.

---

## Task 0: Define registry types

**Files:** `src/main/ai/tools/registry/types.ts` (new)

- [ ] **Step 1: Write the types**

```ts
import type {ToolResult} from "@/ai/tools/types"
import type {Tool} from "@/ai/types"
import type {StorageController} from "@/storage/StorageController"

export type ToolParameters = Tool["function"]["parameters"]

/**
 * Who invoked the tool. Determines downstream confirmation policy in Phase 3.
 *
 * - "in-app": the built-in Daily AI assistant. Phase 3's policy hook will
 *   suspend on isDestructive tools until the user explicitly confirms
 *   in Daily UI (modal card + Promise-based wait, see roadmap Phase 3).
 *
 * - "mcp": an external MCP client (Claude Desktop, Telegram bot, etc).
 *   The client is responsible for getting user confirmation on its OWN
 *   surface before sending the call. Daily passes the request through
 *   without suspending — the user has already agreed somewhere outside.
 *
 * Phase 2 just plumbs this field through; the policy hook that reads it
 * lands in Phase 3.
 */
export type ToolCaller = "in-app" | "mcp"

export type ToolExecutionContext = {
  storage: StorageController
  now: () => Date
  caller: ToolCaller
}

export type RegisteredTool<TParams = Record<string, unknown>> = {
  name: string
  description: string
  parameters: ToolParameters
  /**
   * The tool modifies state (writes to SQLite, mutates settings).
   * Read-only tools have isWrite = false.
   */
  isWrite: boolean
  /**
   * The tool is destructive in a way that warrants explicit user
   * confirmation. Soft-delete tools (delete_task, delete_tag, delete_project)
   * still set this true even though recoverable — the user should know
   * before the action.
   *
   * Confirmation happens on the caller's surface: Daily UI for "in-app",
   * client's UI for "mcp" (see ToolCaller).
   */
  isDestructive: boolean
  /** Optional compact metadata for smaller models (medium/tiny prompt tiers). */
  compactDescription?: string
  compactParameters?: ToolParameters

  execute(params: TParams, ctx: ToolExecutionContext): Promise<ToolResult>
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:main`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/tools/registry/types.ts
git commit -m "feat: add RegisteredTool type for tool registry"
```

---

## Task 1: Skeleton registry index with empty array

**Files:** `src/main/ai/tools/registry/index.ts` (new)

- [ ] **Step 1: Write the skeleton**

```ts
import type {Tool} from "@/ai/types"
import type {RegisteredTool} from "./types"

/**
 * Authoritative list of all tools exposed to the AI agent.
 * Populated by category files (see ./categories/*).
 * Derives AI_TOOLS, AI_TOOLS_COMPACT, and ToolName.
 */
export const REGISTRY: ReadonlyArray<RegisteredTool> = []

export type ToolName = (typeof REGISTRY)[number]["name"]

export const REGISTRY_BY_NAME: ReadonlyMap<string, RegisteredTool> = new Map(REGISTRY.map((t) => [t.name, t]))

export function getRegisteredTool(name: string): RegisteredTool | undefined {
  return REGISTRY_BY_NAME.get(name)
}

export const AI_TOOLS: Tool[] = REGISTRY.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))

export const AI_TOOLS_COMPACT: Tool[] = REGISTRY.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.compactDescription ?? t.description,
    parameters: t.compactParameters ?? t.parameters,
  },
}))
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:main`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/tools/registry/index.ts
git commit -m "feat: scaffold empty tool registry with derived AI_TOOLS"
```

---

## Tasks 2-6: Migrate tools by category

Tasks 2 through 6 each move one category from `ToolExecutor`'s private methods to a category file with `RegisteredTool` entries. After each task, the registry grows and the corresponding switch cases in `ToolExecutor.execute` can be removed.

**Approach for each tool:**

1. Read the JSONL entry to get name/description/parameters.
2. Read the matching private method in [src/main/ai/tools/ToolExecutor.ts](../../../src/main/ai/tools/ToolExecutor.ts) to get the implementation body.
3. Create a `RegisteredTool` entry where `execute(params, ctx)` runs that body using `ctx.storage` instead of `this.storage`.
4. Set `isWrite` and `isDestructive` flags per the table below.
5. If a tool has a different description in `tools-compact.jsonl` than `tools.jsonl`, set `compactDescription` accordingly. Same for parameters. (Most tools won't have separate compact variants — fall back to default.)

**Risk-flag table** (decide once, use across all categories):

| Tool                    | isWrite | isDestructive |
| ----------------------- | ------- | ------------- |
| list_tasks              | false   | false         |
| get_task                | false   | false         |
| create_task             | true    | false         |
| update_task             | true    | false         |
| complete_task           | true    | false         |
| discard_task            | true    | false         |
| reactivate_task         | true    | false         |
| delete_task             | true    | true          |
| get_deleted_tasks       | false   | false         |
| restore_task            | true    | false         |
| permanently_delete_task | true    | true          |
| add_task_tags           | true    | false         |
| remove_task_tags        | true    | false         |
| search_tasks            | false   | false         |
| move_task               | true    | false         |
| move_task_to_project    | true    | false         |
| log_time                | true    | false         |
| list_projects           | false   | false         |
| create_project          | true    | false         |
| rename_project          | true    | false         |
| delete_project          | true    | true          |
| switch_project          | true    | false         |
| get_day_summary         | false   | false         |
| get_task_attachments    | false   | false         |
| remove_task_attachment  | true    | true          |
| list_tags               | false   | false         |
| get_tag                 | false   | false         |
| create_tag              | true    | false         |
| update_tag              | true    | false         |
| delete_tag              | true    | true          |

This table is canonical — copy it into [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) Phase 2 section if it isn't already.

### Task 2: Task tools

**Files:**

- Create: `src/main/ai/tools/registry/categories/taskTools.ts`
- Modify: `src/main/ai/tools/registry/index.ts` (import + spread)
- Modify: `src/main/ai/tools/ToolExecutor.ts` (no behavior change yet — leave switch cases)

- [ ] **Step 1: Read existing implementations**

In [src/main/ai/tools/ToolExecutor.ts](../../../src/main/ai/tools/ToolExecutor.ts) locate private methods: `listTasks`, `getTask`, `createTask`, `updateTask`, `completeTask`, `discardTask`, `reactivateTask`, `deleteTask`, `getDeletedTasks`, `restoreTask`, `permanentlyDeleteTask`, `moveTask`, `logTime`, `searchTasks`. There are 14 task-related tools.

- [ ] **Step 2: Create `taskTools.ts`**

For each tool, write a `RegisteredTool` entry. Take the description and `parameters` JSON Schema verbatim from [src/main/ai/tools/tools.jsonl](../../../src/main/ai/tools/tools.jsonl) (the line matching the tool name). For `execute`, port the body from the private method, replacing `this.storage` with `ctx.storage`. Set `isWrite`/`isDestructive` per the canonical table above.

Example for `list_tasks`:

```ts
import type {RegisteredTool} from "../types"

export const listTasks: RegisteredTool = {
  name: "list_tasks",
  description: "Get tasks for a specific date. …", // from JSONL
  parameters: {
    type: "object",
    properties: {
      date: {type: "string", description: "Date in YYYY-MM-DD format. …"},
      include_done: {type: "boolean", description: "…"},
      project_id: {type: "string", description: "…"},
    },
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    // PORTED body from ToolExecutor.listTasks (see line ~140 in original file)
    // Replace this.storage with ctx.storage. Return {success, data?, error?}.
  },
}
```

Use a helper to enumerate all 14:

```ts
export const TASK_TOOLS: RegisteredTool[] = [
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  discardTask,
  reactivateTask,
  deleteTask,
  getDeletedTasks,
  restoreTask,
  permanentlyDeleteTask,
  moveTask,
  logTime,
  searchTasks,
]
```

- [ ] **Step 3: Wire into registry index**

Update `src/main/ai/tools/registry/index.ts`:

```ts
import {TASK_TOOLS} from "./categories/taskTools"

export const REGISTRY: ReadonlyArray<RegisteredTool> = [...TASK_TOOLS]
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck:main`
Expected: zero errors. (If `parameters` types don't match `ToolParameters`, fix the schema shape — most likely missing `type: "object"`.)

- [ ] **Step 5: Smoke test**

Add `tests/main/ai/tools/registry/taskTools.test.ts`:

```ts
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TASK_TOOLS} from "@main/ai/tools/registry/categories/taskTools"

describe("Task tools registry", () => {
  it("exposes 14 task tools", () => {
    expect(TASK_TOOLS.length).toBe(14)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of TASK_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = TASK_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(
      [
        "complete_task",
        "create_task",
        "delete_task",
        "discard_task",
        "log_time",
        "move_task",
        "permanently_delete_task",
        "reactivate_task",
        "restore_task",
        "update_task",
      ].sort(),
    )
  })

  it("destructive tools are flagged", () => {
    const destructive = TASK_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["delete_task", "permanently_delete_task"].sort())
  })
})
```

Run: `pnpm evitest run tests/main/ai/tools/registry/taskTools.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/tools/registry/categories/taskTools.ts \
        src/main/ai/tools/registry/index.ts \
        tests/main/ai/tools/registry/taskTools.test.ts
git commit -m "refactor: migrate task tools to registry"
```

### Task 3: Tag tools (7 tools)

Mirror Task 2 for: `list_tags`, `get_tag`, `create_tag`, `update_tag`, `delete_tag`, `add_task_tags`, `remove_task_tags`.

File: `src/main/ai/tools/registry/categories/tagTools.ts`
Test: `tests/main/ai/tools/registry/tagTools.test.ts` (same 4-case structure)

Commit: `refactor: migrate tag tools to registry`

### Task 4: Project tools (6 tools)

Mirror Task 2 for: `list_projects`, `create_project`, `rename_project`, `delete_project`, `switch_project`, `move_task_to_project`.

File: `src/main/ai/tools/registry/categories/projectTools.ts`
Test: `tests/main/ai/tools/registry/projectTools.test.ts`

Commit: `refactor: migrate project tools to registry`

### Task 5: File and attachment tools (2 tools)

Mirror Task 2 for: `get_task_attachments`, `remove_task_attachment`.

File: `src/main/ai/tools/registry/categories/fileTools.ts`
Test: `tests/main/ai/tools/registry/fileTools.test.ts`

Commit: `refactor: migrate file tools to registry`

### Task 6: Summary tool (1 tool)

Migrate `get_day_summary`.

File: `src/main/ai/tools/registry/categories/summaryTools.ts`
Test: `tests/main/ai/tools/registry/summaryTools.test.ts`

Commit: `refactor: migrate summary tool to registry`

After Tasks 2-6, REGISTRY contains all 30 tools. Verify total: `pnpm evitest run tests/main/ai/tools/registry/` — expect 30 across all category tests.

---

## Task 7: Switch ToolExecutor to registry dispatch (with caller plumbing)

**Files:**

- Modify: `src/main/ai/tools/ToolExecutor.ts`
- Modify: `src/main/ai/AIController.ts` (pass `"in-app"` to executor)
- Test: `tests/main/ai/tools/ToolExecutor.test.ts` (new)

The `execute` signature gains a `caller: ToolCaller` parameter. In-app AI passes `"in-app"`; MCP dispatcher will pass `"mcp"` (Task 9). The caller field is plumbed through but does not change behavior yet — Phase 3's policy hook will read it later.

- [ ] **Step 1: Write tests**

```ts
// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {ToolExecutor} from "@main/ai/tools/ToolExecutor"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

describe("ToolExecutor (registry-backed)", () => {
  it("dispatches to registered execute via name", async () => {
    const fakeStorage = {
      /* enough to satisfy list_tasks at minimum */
    } as any
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("list_tasks" as any, {date: "2026-06-06"}, "in-app")
    expect(r.success).toBeDefined()
  })

  it("returns error for unknown tool", async () => {
    const exec = new ToolExecutor({} as any)
    const r = await exec.execute("nonexistent_tool" as any, {}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })
})
```

End-to-end caller propagation (`"mcp"` reaches `tool.execute`'s ctx) is covered by Task 9's MCP dispatcher test rather than mocked here.

- [ ] **Step 2: Rewrite `ToolExecutor.execute` as a registry dispatch with caller**

```ts
// New body of ToolExecutor.ts (drop all private methods — they moved to registry)
import {logger} from "@/utils/logger"

import {getRegisteredTool} from "@/ai/tools/registry"

import type {ToolCaller, ToolName} from "@/ai/tools/registry"
import type {StorageController} from "@/storage/StorageController"
import type {ToolParams, ToolResult} from "./types"

export class ToolExecutor {
  constructor(private storage: StorageController) {}

  async execute(toolName: ToolName, params: ToolParams, caller: ToolCaller): Promise<ToolResult> {
    logger.info(logger.CONTEXT.AI, `Executing tool: ${toolName} (${caller})`, params)

    const tool = getRegisteredTool(toolName)
    if (!tool) {
      return {success: false, error: `Unknown tool: ${toolName}`}
    }

    try {
      return await tool.execute(params, {
        storage: this.storage,
        now: () => new Date(),
        caller,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.AI, `Tool execution failed: ${toolName}`, err)
      return {success: false, error: message}
    }
  }
}
```

The `ToolExecutor` file should now be **~30 lines** vs. 830.

- [ ] **Step 3: Update AIController to pass `"in-app"`**

In [src/main/ai/AIController.ts:274](../../../src/main/ai/AIController.ts), change:

```ts
const result = await this.executor.execute(name as ToolName, args as any)
```

to:

```ts
const result = await this.executor.execute(name as ToolName, args as any, "in-app")
```

- [ ] **Step 4: Run main tests**

Run: `pnpm test:main`
Expected: most pass; **MCP dispatcher tests will FAIL** because the executor signature changed from 2-arg to 3-arg. That's expected — Task 9 fixes the MCP side. Do not skip Task 9. Mark this state as in-progress.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/tools/ToolExecutor.ts src/main/ai/AIController.ts tests/main/ai/tools/ToolExecutor.test.ts
git commit -m "refactor: ToolExecutor uses registry dispatch + caller plumbing"
```

---

## Task 8: Delete `tools.ts` and update all call sites

**Files:**

- Delete: `src/main/ai/tools/tools.ts`
- Modify: every file that imports from `@/ai/tools/tools`

The old `src/main/ai/tools/tools.ts` parses JSONL at build time via `?raw` Vite imports. After Tasks 0-7 the registry is the source of truth — keeping `tools.ts` as a re-export shim would just be dead indirection.

- [ ] **Step 1: Find every importer**

Run: `grep -rn "from \"@/ai/tools/tools\"\|from \"./tools\"\|from \"../tools\"" src/`

Expected importers (must all migrate to `@/ai/tools/registry`):

- `src/main/ai/AIController.ts` — imports `AI_TOOLS`, `AI_TOOLS_COMPACT`, `ToolName`
- `src/main/mcp/tools/registry.ts` — imports `AI_TOOLS` (will move to importing `REGISTRY` directly in Task 9, but bridge during this task)

Any import that still says `from "@/ai/tools/tools"` after this task is a bug.

- [ ] **Step 2: Update `AIController.ts` imports**

Change:

```ts
import {AI_TOOLS, AI_TOOLS_COMPACT} from "@/ai/tools/tools"

// ...
import type {ToolName} from "@/ai/tools/tools"
```

to:

```ts
import {AI_TOOLS, AI_TOOLS_COMPACT} from "@/ai/tools/registry"

// ...
import type {ToolName} from "@/ai/tools/registry"
```

- [ ] **Step 3: Update `src/main/mcp/tools/registry.ts` temporarily**

It currently imports `AI_TOOLS` from `@/ai/tools/tools`. Repoint to `@/ai/tools/registry` (the export shape is identical for now). Task 9 will switch from `AI_TOOLS` to the underlying `REGISTRY` for a cleaner contract.

```ts
import {AI_TOOLS} from "@/ai/tools/registry"
```

- [ ] **Step 4: Delete `src/main/ai/tools/tools.ts`**

```bash
git rm src/main/ai/tools/tools.ts
```

- [ ] **Step 5: Confirm zero references remain**

Run: `grep -rn "ai/tools/tools\"" src/ tests/`
Expected: zero matches.

- [ ] **Step 6: Typecheck and tests**

Run: `pnpm typecheck:main && pnpm typecheck:render && pnpm typecheck:shared`
Expected: zero errors across all three.

Run: `pnpm test:main`
Expected: tests still in mid-refactor state (MCP dispatcher signature mismatch from Task 7); resolved in Task 9.

- [ ] **Step 7: Commit**

```bash
git add -u src/main/ai/AIController.ts src/main/mcp/tools/registry.ts
git commit -m "refactor: drop tools.ts re-export shim, update all imports to registry"
```

---

## Task 9: Migrate MCP to share the registry + pass `"mcp"` caller

**Files:**

- Modify: `src/main/mcp/tools/registry.ts`
- Modify: `src/main/mcp/tools/dispatcher.ts`
- Modify: `tests/main/mcp/tools/dispatcher.test.ts`

Two changes in this task:

1. MCP-side registry sources from the shared `REGISTRY` instead of the derived `AI_TOOLS` array.
2. MCP dispatcher passes `"mcp"` as the caller when invoking `executor.execute`, restoring the suite green after Task 7.

- [ ] **Step 1: Migrate `src/main/mcp/tools/registry.ts` to source from `REGISTRY`**

```ts
import {REGISTRY} from "@/ai/tools/registry"
import {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

// ... existing types stay

export function buildMcpToolRegistry(): McpToolRegistry {
  const blocked = new Set<string>(MCP_BLOCKED_TOOL_NAMES)
  const tools: McpTool[] = REGISTRY.filter((t) => !blocked.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.parameters ?? {type: "object"}) as McpTool["inputSchema"],
  }))

  const byName = new Map(tools.map((t) => [t.name, t]))
  return {list: () => tools, has: (name) => byName.has(name)}
}
```

- [ ] **Step 2: Update `McpToolDispatcher` to pass `"mcp"` caller**

In `src/main/mcp/tools/dispatcher.ts`, find:

```ts
return await this.executor.execute(name as any, params)
```

Change to:

```ts
return await this.executor.execute(name as any, params, "mcp")
```

The dispatcher's `Pick<ToolExecutor, "execute">` parameter type continues to match the new 3-arg signature without further edits — TypeScript widens correctly.

- [ ] **Step 3: Update dispatcher tests**

In `tests/main/mcp/tools/dispatcher.test.ts`, the mock executor's `execute` method is currently `vi.fn(async (name, params) => ...)`. Either:

- Loosen to `(...args: any[]) => ...` (simplest), OR
- Match new signature: `async (name: string, params: any, caller: string) => impl(name, params)` and add an assertion that `caller === "mcp"`.

Recommended: do both — loosen for existing four tests, plus add a new test that explicitly asserts caller propagation:

```ts
it("passes 'mcp' as the caller to ToolExecutor", async () => {
  const executor = makeExecutor(() => ({success: true}))
  const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

  await d.call("list_tasks", {})
  expect(executor.execute).toHaveBeenCalledWith("list_tasks", {}, "mcp")
})
```

- [ ] **Step 4: Run MCP suite + full main suite**

Run: `pnpm evitest run tests/main/mcp/`
Expected: all MCP tests pass (registry filtering, dispatcher behavior, caller propagation).

Run: `pnpm test:main`
Expected: full suite green. This task resolves the temporary breakage from Task 7 Step 4.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/tools/registry.ts src/main/mcp/tools/dispatcher.ts tests/main/mcp/tools/dispatcher.test.ts
git commit -m "refactor: MCP registry sources from shared registry, dispatcher passes 'mcp' caller"
```

---

## Task 10: Delete JSONL files

**Files:**

- Delete: `src/main/ai/tools/tools.jsonl`
- Delete: `src/main/ai/tools/tools-compact.jsonl`

Confirm nothing imports them: `grep -rn "tools.jsonl\|tools-compact.jsonl" src/` should return zero matches after Task 8.

```bash
git rm src/main/ai/tools/tools.jsonl src/main/ai/tools/tools-compact.jsonl
git commit -m "chore: remove tools JSONL files (registry is now source of truth)"
```

---

## Task 11: Drift-detection tests

**Files:**

- Test: `tests/main/ai/tools/registry/registry.test.ts` (new)

The unified registry test that locks down invariants across categories.

- [ ] **Step 1: Write the test**

```ts
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {AI_TOOLS, AI_TOOLS_COMPACT, getRegisteredTool, REGISTRY} from "@main/ai/tools/registry"
import {MCP_BLOCKED_TOOL_NAMES} from "@main/mcp/constants"

describe("Tool registry invariants", () => {
  it("contains exactly 30 tools", () => {
    expect(REGISTRY.length).toBe(30)
  })

  it("all tool names are unique", () => {
    const names = REGISTRY.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("AI_TOOLS mirrors registry size", () => {
    expect(AI_TOOLS.length).toBe(REGISTRY.length)
    expect(AI_TOOLS_COMPACT.length).toBe(REGISTRY.length)
  })

  it("every tool has parameters.type === 'object'", () => {
    for (const t of REGISTRY) expect(t.parameters.type).toBe("object")
  })

  it("getRegisteredTool returns entry for every name", () => {
    for (const t of REGISTRY) {
      expect(getRegisteredTool(t.name)).toBe(t)
    }
  })

  it("getRegisteredTool returns undefined for unknown names", () => {
    expect(getRegisteredTool("nonexistent")).toBeUndefined()
  })

  it("MCP blocked tool names all exist in the registry", () => {
    for (const name of MCP_BLOCKED_TOOL_NAMES) {
      expect(getRegisteredTool(name), `blocked tool ${name} not in registry`).toBeDefined()
    }
  })

  it("every MCP-blocked tool is marked isDestructive", () => {
    for (const name of MCP_BLOCKED_TOOL_NAMES) {
      const t = getRegisteredTool(name)
      expect(t?.isDestructive, `${name} should be isDestructive`).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run and confirm pass**

Run: `pnpm evitest run tests/main/ai/tools/registry/registry.test.ts`
Expected: 8 cases pass.

- [ ] **Step 3: Commit**

```bash
git add tests/main/ai/tools/registry/registry.test.ts
git commit -m "test: lock down tool registry invariants and MCP/registry consistency"
```

---

## Task 12: Full-suite gate

- [ ] `pnpm lint` — clean.
- [ ] `pnpm typecheck:all` — zero errors across main/render/shared.
- [ ] `pnpm test` — all tests pass. Verify total count went UP (added per-category + registry tests) and existing AI/MCP tests still pass.
- [ ] `pnpm circular` — no new circular deps.
- [ ] Manual smoke: `pnpm dev`, open Daily, send a message to the AI assistant, verify a tool gets called and returns a result. Then if MCP is enabled, run a `curl` against `http://127.0.0.1:7878/mcp` and verify `tools/list` still returns 26.

If any gate fails, fix and amend the relevant task's commit.

---

## Self-Review Notes

**Spec coverage** (against [docs/agent-system-roadmap.md](../../agent-system-roadmap.md) Phase 2):

- "One canonical list of built-in tools" → Tasks 2-6 (REGISTRY array).
- "Tool schemas are generated from registry entries" → Task 1 (`AI_TOOLS` / `AI_TOOLS_COMPACT` are computed `.map()`s).
- "Tool execution dispatch no longer depends on a long switch statement" → Task 7 (~25-line `ToolExecutor.execute`).
- "Tests fail if schema/executor metadata drifts" → Tasks 2-6 per-category + Task 11 unified.
- "isWrite / isDestructive booleans replace 4-level enum" → Task 0 (types) + per-category migration.
- MCP-side updates: Task 9 (no behavior change, just source of truth swap).
- JSONL files removed: Task 10.

**Risks / things to watch:**

- **Vite `?raw` imports** in the old `tools.ts` are dropped (Task 8). If anything else in the codebase imports JSONL directly, grep before Task 10. Currently only `tools.ts` does.
- **`ToolName` type narrowing.** The current `ToolName` in `tools.ts` is a hand-maintained union. After registry, it's derived. Make sure any `as ToolName` casts in `AIController.ts` and `McpToolDispatcher` still type-check; if not, the registry's `as const` array shape might need adjusting (or convert from array to a const tuple via `satisfies`).
- **Tool bodies depending on `this.executor` helpers.** The current `ToolExecutor.ts` has private helper methods like `getTodayDate()`, `formatDuration()`, `formatTask()`. Some tool bodies use them. Either:
  - (a) Move helpers to a separate module under `src/main/ai/tools/registry/helpers.ts` (preferred).
  - (b) Inline the small ones into the tool's `execute`.
    Check during Task 2.
- **`promptTier`-based parameter overrides.** The current code uses `currentToolSchemas` (`AIController.ts:27`) for argument validation, populated from `getToolsForTier()` (line 282). After this refactor, validation should still work because `AI_TOOLS` / `AI_TOOLS_COMPACT` retain the same shape — just sourced from registry instead of JSONL. Verify in Task 8.
