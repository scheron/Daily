# Phase 10 — Prompt + Logging Cleanup

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Stop relying on the system prompt for destructive-action safety now that the runtime enforces it (Phase 3 policy hook). Reduce log noise that captures full user content — keep counts, names, ids; drop free-form text by default.

**Architecture:**

- Trim each system prompt: delete the "ask confirmation before destructive tools" paragraph (the runtime gate is unbreakable). Keep the `respond` invariant (Phase 4) and the "no IDs invention / no fake completion" rules (still useful guidance).
- New `src/main/ai/utils/redact.ts` with two helpers — `redactAiMessagesForLog`, `redactToolParamsForLog` — used by AIController/ToolExecutor in debug paths.
- Replace `logger.debug("Prepared LLM messages", {...lengths})` style calls so they never carry user content. Tool calls log only `{name, paramKeys}`. Already-info logs that just dump strings (e.g. tool params at INFO in `ToolExecutor.execute`) drop to debug + redacted.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 10.

---

## Task 0: Redaction helpers + tests

- [ ] `src/main/ai/utils/redact.ts` with both helpers.
- [ ] `tests/main/ai/utils/redact.test.ts`.

## Task 1: Apply redaction at log sites

- [ ] `AIController.callLLM` debug → use `redactAiMessagesForLog(messages)`.
- [ ] `ToolExecutor.execute` info → demote to debug; log `{toolName, caller, paramKeys}` only.
- [ ] `OpenAiCompatibleClient` request/response info → log `{model, messagesCount}` (no full messages array).

## Task 2: Trim prompts

- [ ] Drop the destructive-action-confirmation paragraph from `getSystemPrompt`, `getSystemPromptCompact`, `getSystemPromptTiny`. Keep the rest of safety contract (no-invented-IDs, no-fake-completion).

## Task 3: Gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.
