# Phase 7 — Live Event Stream

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Expose live agent progress to the renderer for observability and richer "thinking…" UI. The renderer can now know when the LLM is being called, when each tool starts/finishes, and when the turn ends — not just see the final response.

**Architecture:**

- Shared `AIEvent` discriminated union: `turn_started`, `model_requested`, `model_responded`, `tool_started`, `tool_finished`, `turn_finished`, `turn_failed`, `turn_cancelled`.
- `AIController` constructor gains a fourth optional callback: `broadcastEvent?: (event: AIEvent) => void`.
- Emit events at corresponding points in `sendMessage`. Tool params are NOT included in tool_started — only `toolName` and `toolCallId`, to avoid leaking user content into the event channel.
- Confirmation events from Phase 3 stay on their own dedicated channel (no behavior change for the card UI).
- New IPC channel `ai:on-event` exposed via preload. Renderer store can subscribe later (Phase 10 / future polish); not required to wire UI consumption now.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 7.

---

## Task 0: Shared `AIEvent` type + IPC channel

- [ ] Append `AIEvent` to `src/shared/types/ai.ts`.
- [ ] Add `ai:on-event` to `BridgeIPC`.
- [ ] Commit.

## Task 1: AIController broadcaster

- [ ] Add `broadcastEvent` constructor param and emit at the documented points.
- [ ] Tests verifying event order for a successful respond-only turn and for a tool→respond turn.
- [ ] Commit.

## Task 2: Preload + main wiring

- [ ] Expose `ai:on-event` in preload.
- [ ] `app.ts` wires the broadcaster to `windows.assistant ?? windows.main`.
- [ ] Commit.

## Task 3: Full gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.

---

## Out of scope

- Renderer UI changes (Phase 10 cleanup or follow-up). Channel is plumbed; consumption optional.
