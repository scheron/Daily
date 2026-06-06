# GrammarDiff — vendored reference for the local-model migration

This folder is a **snapshot** of the relevant slices of the GrammarDiff project
(`~/Documents/Projects/Personal/bmox0/GrammarDiff`) at the moment the local-model
migration plan was authored.

It exists solely so that:

- Subagents executing the migration plan can read reference implementations via
  relative repo paths (no dependency on absolute paths on any developer machine).
- The "source of truth" we are porting from stays fixed-in-time, even if the
  upstream GrammarDiff project keeps evolving.
- Reviewers can diff the adopted Daily code against the original side-by-side.

## Scope

Only files that inform the migration are vendored:

- `src/main/ai/*` — the entire local-model AI layer (LlamaServer, ModelService,
  AIController, catalog/manifest, OpenAiCompatibleClient, modelSpeed, types).
- `src/main/utils/files/downloadWithProgress.ts` — resumable + SHA256-verifying
  download helper.
- `src/shared/types/ai.ts` — shared types (`RuntimeState`, `ModelInfo`,
  `DownloadPhase`, etc).
- `src/shared/utils/stripThinking.ts` — thinking-filter (Daily already has its
  own `filterThinkBlocks` — included only for reference comparison).
- `src/main/app.ts`, `config.ts`, `preload.ts`, `windows.ts`, `tsconfig.json`,
  `utils/AsyncMutex.ts`, `utils/logger.ts`, `types/*.ts` — orientation context
  for how the reference project wires the AI layer.
- `resources/models.json` — the **format** of the JSON catalog (the **content**
  is grammar-correction models; Daily's catalog will hold agent-friendly models
  like Qwen3 / Hermes 3).

Renderer code, storage code, tests, and product-specific UI are intentionally
NOT vendored — Daily has its own.

## Status

Read-only reference. **Do not modify** these files as part of the migration.
After the migration is complete and merged, this folder can be removed
(history preserves it).

## Spec

Migration plan: `docs/superpowers/specs/2026-06-06-local-model-migration.md`.
