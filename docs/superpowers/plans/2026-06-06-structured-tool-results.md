# Phase 6 — Structured Tool Results

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Tool results stop being opaque strings. Each tool returns a structured `ToolResult` carrying an optional model-friendly `summary`, optional typed `data`, and a list of `changedEntities` so downstream consumers (UI, Phase 7 events, Phase 8 compaction, persistence) can see which task / tag / project / file was created, updated, deleted, restored, or moved without parsing prose. Backwards compatible: existing tools that set `data` as a string continue to work — the formatter falls back to the data string when `summary` is absent.

**Architecture:**

1. `ToolResult` gains optional `summary` and `changedEntities`. Existing `data?: unknown` stays.
2. New shared `ChangedEntity` type in `src/main/ai/tools/types.ts` (lives with the executor types, not in `shared/` — only main consumes it).
3. New `src/main/ai/tools/format.ts` exports:
   - `toModelToolMessage(result)` → string for the LLM tool message.
   - `toRendererToolCall(result, toolName)` → `{name, result}` for `AIMessage.toolCalls`.
4. `AIController` uses these formatters where it currently inlines `JSON.stringify(toolResultStruct)` and `toolResultStruct.data?.toString()`.
5. Write tools fill in `changedEntities` — create/update/complete/discard/reactivate/log_time/add_tags/remove_tags/move/move_to_project/restore for tasks; create/rename/switch/delete for projects; create/update/delete for tags; remove_attachment for files; delete/permanently_delete for tasks. Read tools and the `respond` meta tool are unchanged.

**Tech Stack:** TypeScript only. No new dependencies.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 6.

---

## Task 0: Type + formatters

- [ ] Modify `src/main/ai/tools/types.ts`:

```ts
export type ChangedEntityType = "task" | "tag" | "project" | "file"
export type ChangedEntityAction = "created" | "updated" | "deleted" | "restored" | "moved"
export type ChangedEntity = {type: ChangedEntityType; id: string; action: ChangedEntityAction}

export type ToolResult = {
  success: boolean
  /** Model-friendly one-line description. Falls back to data/error if absent. */
  summary?: string
  data?: unknown
  changedEntities?: ChangedEntity[]
  error?: string
}
```

- [ ] Create `src/main/ai/tools/format.ts`:

```ts
import type {ToolResult} from "./types"

export function toModelToolMessage(result: ToolResult): string {
  if (result.error) return JSON.stringify({success: false, error: result.error})
  const summary = result.summary ?? (typeof result.data === "string" ? result.data : "")
  if (summary) return JSON.stringify({success: result.success, data: summary})
  if (result.data !== undefined) return JSON.stringify({success: result.success, data: result.data})
  return JSON.stringify({success: result.success})
}

export function toRendererToolCall(toolName: string, result: ToolResult): {name: string; result: string} {
  const summary = result.summary ?? (typeof result.data === "string" ? result.data : "")
  return {name: toolName, result: summary || result.error || (result.success ? "Done" : "Failed")}
}
```

- [ ] Unit test `tests/main/ai/tools/format.test.ts` — summary path, data fallback, error path, structured-data path.
- [ ] Commit.

---

## Task 1: AIController uses formatters

- [ ] Replace inline serialisation in `sendMessage` with `toModelToolMessage` + `toRendererToolCall`.
- [ ] AIController tests still pass (no behavioral change for legacy string-data tools).
- [ ] Commit.

---

## Task 2: Migrate write tools to fill `changedEntities`

Walk every write tool and append a `changedEntities: [{type: ..., id: ..., action: ...}]` array next to the existing `data` line. Don't remove the data — keep it as the summary. Don't add `summary` separately yet — too noisy and the formatter already falls back to data.

Targets:

- Task: `createTask` (created), `updateTask` (updated), `completeTask` (updated), `discardTask` (updated), `reactivateTask` (updated), `logTime` (updated), `addTaskTags` (updated), `removeTaskTags` (updated), `moveTask` (moved), `moveTaskToProject` (moved), `restoreTask` (restored), `deleteTask` (deleted), `permanentlyDeleteTask` (deleted).
- Project: `createProject` (created), `renameProject` (updated), `switchProject` (updated), `deleteProject` (deleted).
- Tag: `createTag` (created), `updateTag` (updated), `deleteTag` (deleted).
- File: `removeTaskAttachment` (deleted, type: "file").

For each tool the pattern is one extra field at the success return site. Read tools unchanged.

- [ ] Commit.

---

## Task 3: Full-suite gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.
