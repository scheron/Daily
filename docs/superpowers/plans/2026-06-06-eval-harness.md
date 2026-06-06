# Phase 9 — Eval Harness

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** A repeatable suite that drives the real `AIController` through scripted LLM responses and asserts the agent's behavior end-to-end — without an API key. Lays the groundwork for regression-testing prompt and runtime changes without manual app testing.

**Architecture:**

- `tests/main/ai/helpers/mockAiClient.ts` — `scriptedChat(ctrl, responses)` helper that wires `vi.spyOn` on the active provider's `chat` so the controller drives through the scripted answers.
- `tests/main/ai/helpers/agentFixture.ts` — `makeFixture()` returns a configured controller with a stub storage that records turn persistence calls. Encapsulates the boilerplate every eval needs.
- `tests/main/ai/evals/*.eval.test.ts` — one file per scenario. Initial set: destructive confirmation, permanent-delete confirmation, cancel-mid-turn, respond-protocol invariant.
- Existing `AIController.test.ts` stays as fine-grained unit tests; evals live in `evals/` and focus on high-level behavior.

No Chelsea baseline — this is built from scratch, but it reuses the proven scripting shape already used in `AIController.test.ts`.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 9.

---

## Task 0: Helpers (mockAiClient + agentFixture)

- [ ] Create both helper files.

## Task 1: Scenario — destructive confirmation

- [ ] `tests/main/ai/evals/destructive-confirmation.eval.test.ts`. Model emits `delete_task` → confirm → executor called. Cancel path covered too.

## Task 2: Scenario — permanent-delete confirmation

- [ ] `tests/main/ai/evals/permanent-delete-confirmation.eval.test.ts`. Same shape as Task 1 with `permanently_delete_task`.

## Task 3: Scenario — cancel-mid-turn

- [ ] `tests/main/ai/evals/cancel.eval.test.ts`. Long-running tool then cancel() — turn rolls back with no executor follow-up.

## Task 4: Scenario — respond-protocol invariant

- [ ] `tests/main/ai/evals/respond-protocol.eval.test.ts`. Confirms LLM `tool_choice: "required"` is passed; respond text becomes finalMessage.

## Task 5: Gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.

---

## Out of scope (deferred)

- Live LLM evals (`pnpm ai:eval:live`) gated behind env/API keys.
- The remaining 6 scenarios in the roadmap (batch, tag assignment, project move, ambiguous match, list today, create task with date/time). The helper + scenario files are templates — adding more is mechanical.
