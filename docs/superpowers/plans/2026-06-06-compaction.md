# Phase 8 — Conversation Compaction (deterministic summary)

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Keep long AI sessions inside the LLM context window without losing important domain facts. Old turns are summarized into a single system message; recent turns stay verbatim. Compaction is deterministic — built from persisted `changedEntities` and `finalMessage`, not LLM-generated — so it is cheap, testable, and never hallucinates.

**Architecture:**

- `src/main/ai/memory/deterministicSummary.ts` — pure function `summarizeTurns(turns: AgentTurn[]): string` that produces a numbered list of past user requests + the most important changed entities.
- `src/main/ai/memory/ConversationCompactor.ts` — small class holding the cached summary, with `refresh(turns)` and `makeHook(opts)`. The hook is a `TransformContextHook` that splices the cached summary system message right after the main system prompt and trims the conversation prefix down to the last K messages.
- `AIController` instantiates the compactor in `init()`, registers the hook, and refreshes the summary on each turn (after persistence) using `storage.getActiveAiSessionTurns()`.
- Compaction triggers when in-memory message count exceeds the tier-dependent threshold (`tiny: 16`, `medium: 32`, `large: 64`).

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 8.

---

## Task 0: Pure summary function + test

- [ ] `summarizeTurns(turns)` builds: "Session memory summary:\n- ... " bulleted lines.
- [ ] Test it.

## Task 1: Compactor class + hook + test

- [ ] `refresh(turns)` updates cached summary.
- [ ] `makeHook({keepLastMessages})` returns a `TransformContextHook` that, when called, splices summary as a `system` message and keeps only `keepLastMessages` of the original conversation prefix.
- [ ] Tests for both no-summary and with-summary paths.

## Task 2: AIController integration

- [ ] In `init()` create compactor and register hook (`keepLastMessages` derived from prompt tier).
- [ ] After `persistTurn()` in `sendMessage`, refresh compactor with the latest persisted turns.
- [ ] Existing AIController tests should pass unchanged.

## Task 3: Gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.
