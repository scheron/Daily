# Local Model Stack Migration — Design Spec

> **Branch strategy:** This work happens on `feat/local-model-migration`, branched from `feat/agentic` (not from `main`). Both branches are merged into `main` in a single series after manual testing of the combined surface.

## Goal

Migrate every local-model-infrastructure improvement from the reference project (vendored snapshot at `migration_assets/GrammarDiff/`, originally from `~/Documents/Projects/Personal/bmox0/GrammarDiff`) into Daily, and refresh both the llama.cpp binary and the model catalog as part of the same work.

The vendored snapshot is the **authoritative reference** during this migration. Subagents executing the plan should read `migration_assets/GrammarDiff/src/main/ai/*` and related files rather than chasing the external path — see `migration_assets/GrammarDiff/README.md` for scope and rationale.

Concretely:

- llama.cpp `b5200` → `b9374` (or whatever is latest stable at implementation time), including the new `--flash-attn on` syntax.
- Catalog refresh: drop the outdated Qwen2.5-3B / Mistral 7B v0.3 / Mixtral 8x7B and replace with **Qwen3 4B Instruct / Hermes 3 Llama 3.1 8B / Qwen3 14B Instruct** — all picked for agent / function-calling fit.
- All hardening primitives from GrammarDiff: SHA256 verification (binary + GGUF), resumable downloads, idle unload, orphan cleanup, DI in `AIController`, dedup of parallel server starts, correct `deleteModel`, `partialBytes` in `ModelInfo`, `speedScore` for UX.

## Non-goals

- Preserving previously-downloaded GGUFs on developer machines. AI is pre-production; users who had Mistral-7B or Mixtral will simply re-download from the new catalog.
- Backwards compatibility with the current `MODEL_MANIFEST` TypeScript constant. It is replaced wholesale by the JSON catalog.
- Disabling thinking blocks. Daily's existing `filterThinkBlocks` postprocess stays. (Decision made during brainstorm: thinking can help an agent reason before tool calls; we filter rather than disable.)
- Changing anything in the agentic loop (Phase 3-10 work from `feat/agentic` is untouched).

## Architectural principles

### 1. JSON catalog is the only source of truth

`resources/models.json`:

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "qwen3-4b-instruct",
      "title": "Qwen3 4B Instruct",
      "description": "Fast everyday model with strong function calling.",
      "tier": "fast",
      "sizeBytes": ...,
      "requirements": {"ramGb": 6, "diskGb": 3},
      "ggufUrl": "https://huggingface.co/.../Qwen3-4B-Instruct-Q4_K_M.gguf",
      "ggufFilename": "Qwen3-4B-Instruct-Q4_K_M.gguf",
      "sha256": "<computed at plan time via curl | shasum -a 256>",
      "serverArgs": {"ctx": 8192, "gpuLayers": 99, "temperature": 0.3},
      "recommended": false,
      "accuracy": 0.7
    }
  ]
}
```

`catalog.ts` loads, validates `schemaVersion`, validates every entry with a per-field reject log, and returns `ModelManifestEntry[]`. Unknown / future `schemaVersion` → fail loudly with a clear error.

**No model id, title, description, tier, size, requirements, or accuracy is hardcoded anywhere outside the JSON file.** This is enforced by a grep audit during the plan execution and codified as a comment at the top of `catalog.ts`. The renderer receives everything through the existing `ai:local-list-models` IPC — no parallel hardcoded list in any Vue store or component.

### 2. `promptTier` derived from `tier`, not encoded per-model

Daily's prompt tiering (`tiny` / `medium` / `large`) maps from catalog `tier`:

| Catalog `tier` | Prompt tier |
| -------------- | ----------- |
| `fast`         | `tiny`      |
| `balanced`     | `medium`    |
| `quality`      | `large`     |

This removes a per-model field that was duplicated knowledge between manifest authoring and prompt selection. The mapping lives in one place.

### 3. `AIController` becomes DI-friendly

```ts
type AIControllerDeps = {
  modelService?: ModelService
  llamaServer?: LlamaServer
  client?: OpenAiCompatibleClient
}

constructor(storage, broadcast, deps: AIControllerDeps = {}) {
  this.modelService = deps.modelService ?? new ModelService()
  this.injectedServer = deps.llamaServer ?? null
  this.client = deps.client ?? new OpenAiCompatibleClient()
}
```

Tests replace concrete implementations cleanly. Production paths keep the existing defaults.

### 4. SHA256 verification at every download boundary

- llama-server archive: catalog'd SHA256 in `manifest.ts` (`SERVER_BINARY.macos.{arm64,x64}.sha256`). Mismatch → unlink archive → throw.
- GGUF model file: SHA256 from the JSON catalog. Mismatch → unlink partial → throw. UI sees `phase: "verifying"` while hashing.

### 5. Resumable downloads

Single helper `downloadWithProgress`:

- Partial file at `${destPath}.download`. Survives interruption.
- On retry: `Range: bytes=<size>-`, falls back to fresh download on 416.
- SHA256 verification happens **before** renaming partial to final.
- `ModelInfo.partialBytes` is populated by `ModelService.listModels()` when a `.download` is present without a final file — drives the renderer's "Continue" button.

### 6. Idle unload

- New setting `settings.ai.unloadModel: "never" | "5m" | "15m" | "30m"`, default `"15m"`.
- `AIController` keeps a `setInterval` (60 s tick) reading the current setting and `lastActivityAt`. Above threshold → `server.stop()`.
- `lastActivityAt` updates at every `sendMessage`.
- No DB migration needed: `settings` is a JSON blob with deep-merge in `SettingsModel`. Adding a key with `getDefaultSettings()` covers the upgrade.

### 7. `deleteModel` correctness

If the model being deleted is the model the server is currently running:

1. `server.unload()` first.
2. `modelService.deleteModel(id)` — removes both the final file and any leftover partial.
3. Clear `settings.ai.model` if it pointed at the deleted model.
4. Broadcast new runtime state.

### 8. `ensurePromise` deduplication of server starts

`AIController.ensureRunning(modelId)` returns an in-flight promise when one already exists. Two concurrent `sendMessage` calls cannot trigger two `server.start` paths.

### 9. Orphan cleanup includes `.download` files

`ModelService.init` deletes any `.gguf` or `.gguf.download` file in `modelsDir` whose name is not in the current catalog. Removes the only known way for partial-file garbage to accumulate.

### 10. `speedScoreFromSize` for UI

`ModelService.listModels()` augments each `ModelInfo` with `speed: number in [0.05, 1]` computed from `sizeBytes`. Renderer uses it for sorting/labelling without per-model hardcodes.

## Component-by-component changes

### `src/main/ai/clients/local/core/`

- **`manifest.ts`** — keeps only `SERVER_BINARY` (with `sha256` per arch) and `UNLOAD_OPTION_MS`. The `MODEL_MANIFEST` constant is removed; downstream consumers go through `ModelService.getEntry(id)` / `getCatalog()`.
- **`catalog.ts`** (new) — `loadCatalog(filePath)` + `parseEntry()`. Schema validation, per-field reject log.
- **`LlamaServer.ts`** — `ensureBinary()` adds SHA256 check, version check stays. `--flash-attn on` synced with new binary. `unload()` separated from `stop()` (so `installed` → `not_installed` transition is explicit). Switch from `.zip` to `.tar.gz` archive format (matches new llama.cpp releases for macOS).
- **`LocalModelService.ts`** — DI-able (`constructor(modelsDir?, catalog?)`). `cleanupOrphanedModels` also matches `.download` files. `listModels()` includes `partialBytes` and `speed`. `deleteModel()` removes both `.gguf` and `.gguf.download` files.

### `src/main/utils/files/downloadWithProgress.ts`

Rewrite to GrammarDiff shape: temp `${destPath}.download` file, `Range` header for resume, 416 handling, SHA256 verify, `phase: "downloading" | "verifying"` callbacks.

### `src/main/ai/AIController.ts`

- Constructor takes `AIControllerDeps`.
- Adds `idleTimer` (`setInterval` on 60 s) + `checkIdle()`.
- Adds `ensurePromise` dedup pattern for server starts.
- Adds `prewarm()` (optional convenience — invoked on assistant-window focus later).
- `deleteModel(id)` cleans up server state + clears `settings.ai.model` if it was the deleted one.

### `src/shared/types/ai.ts`

- `LocalModelInfo` gains `partialBytes?: number`, `speed: number`, `accuracy?: number`, `tier: "fast" | "balanced" | "quality"`.
- `LocalModelDownloadProgress` gains `phase: "downloading" | "verifying"`.

### `src/shared/types/settings.ts`

- `Settings.ai.unloadModel: "never" | "5m" | "15m" | "30m"` (default `"15m"` via `getDefaultSettings()`).

### Renderer

- `ai/localModel.store.ts` — passes through new `ModelInfo` fields verbatim.
- `views/Settings/...` — new section for `unloadModel`; new "Continue" button when `partialBytes > 0`; verifying state in the download UI.
- **Audit:** grep for any literal `daily-fast` / `daily-balanced` / `daily-quality` / model titles / descriptions in `renderer/**/*.{ts,vue}`. Remove every hit — these must come from the catalog via IPC.

### Resources

- `resources/models.json` — the new catalog.
- `electron-builder` config — include `resources/models.json` in packaged app, accessible via `fsPaths.modelsCatalogPath()`.

## Phase plan (sequential, one branch)

| #   | Phase                                                                                                      | Depends on                 |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | JSON catalog + validator + `tier` field (no behavior change, refactor)                                     | —                          |
| 2   | llama.cpp `b9374+` upgrade + new catalog contents (Qwen3 4B / Hermes 3 8B / Qwen3 14B) + SHA256 for binary | 1                          |
| 3   | SHA256 for GGUF + `verifying` phase in `DownloadProgress` + `partialBytes` in `ModelInfo`                  | 1                          |
| 4   | Resumable downloads (`.download` partial, `Range` header, 416 handling, orphan cleanup of `.download`)     | 3                          |
| 5   | Idle unload + `Settings.unloadModel` UI + `checkIdle` loop in `AIController`                               | — (parallel-safe with 3-4) |
| 6   | `deleteModel` correctness + `ensurePromise` dedup                                                          | —                          |
| 7   | DI rework in `AIController`                                                                                | —                          |
| 8   | Renderer UI polish: `partialBytes` "Continue" button, `speedScore`, verifying spinner                      | 3, 4                       |

After each phase: gate is `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`. Plus, after Phase 2: full `pnpm evitest run tests/main/ai/evals/` to catch tool-calling regressions from the new llama.cpp.

## Catalog snapshot (provisional — finalized at plan time)

| Tier                           | Model                 | Suggested GGUF source                    | Q4_K_M size | RAM   |
| ------------------------------ | --------------------- | ---------------------------------------- | ----------- | ----- |
| fast                           | Qwen3 4B Instruct     | `bartowski/Qwen3-4B-Instruct-2507-GGUF`  | ~2.5 GB     | 6 GB  |
| balanced (`recommended: true`) | Hermes 3 Llama 3.1 8B | `bartowski/Hermes-3-Llama-3.1-8B-GGUF`   | ~5 GB       | 10 GB |
| quality                        | Qwen3 14B Instruct    | `bartowski/Qwen3-14B-Instruct-2507-GGUF` | ~9 GB       | 16 GB |

Exact filenames and SHA256s are resolved during plan execution by:

```bash
curl -sIL <ggufUrl> | grep -i content-length
curl -sL <ggufUrl> | shasum -a 256
```

The catalog values are not placeholders that block implementation — they are inputs gathered during the first hour of plan execution and committed alongside the JSON file.

## Testing strategy

- **`catalog.ts`**: unit tests on validator — valid catalog, unknown `schemaVersion`, missing required fields per type (string / number / unit), malformed `serverArgs`, malformed `requirements`.
- **`downloadWithProgress.ts`**: unit tests with mocked `fetch` returning streamed `Response` bodies, `tmpdir` for destinations. Cases: fresh download, resume with `Range`, 416 → fresh restart, SHA256 mismatch → throw + partial deleted, SHA256 success → final file renamed.
- **`LocalModelService.ts`**: unit tests with `tmpdir` + DI'd in-memory catalog. Cases: `listModels` reports `partialBytes` when `.download` exists, `cleanupOrphanedModels` removes both `.gguf` and `.gguf.download` orphans, `deleteModel` removes both, `downloadModel` calls `downloadWithProgress` correctly.
- **`LlamaServer.ts`**: mock `node:child_process.spawn` and `node:fs/promises`. Cases: `ensureBinary` short-circuits when correct version present; SHA256 mismatch on archive throws; `start` → `waitForReady` polls `/health`; `unload` returns to `not_installed`, `stop` returns to `installed`.
- **`AIController` idle unload**: `vi.useFakeTimers()`, advance time past threshold, assert `server.stop()` called. Cases per `unloadModel` value: `"never"` → no stop; `"5m"` / `"15m"` / `"30m"` → stop after the configured window.
- **`AIController` ensurePromise**: two concurrent `sendMessage` (or `prewarm`) calls — assert `server.start` is called once.
- **`AIController` deleteModel correctness**: model X running, request to delete X → `server.unload` called before `modelService.deleteModel`, then `settings.ai.model` cleared.
- **Integration: catalog → IPC → renderer**: existing renderer-store tests verify that hardcoded model strings have been removed (grep test as part of the suite).

## Risks

1. **llama.cpp `b9374` tool-calling regression.** The `--jinja` codepath has changed since `b5200`. Mitigation: after Phase 2, run the full agent eval suite (Phase 9 work) + manual `create_task` / `delete_task` confirmation flow through the UI.
2. **Hermes 3 / Qwen3 jinja template compatibility.** Some chat templates have edge cases with `tool` role messages and `tool_choice: "required"`. Mitigation: add a smoke eval that loads each catalog model into the test fixture and runs one tool-call cycle (when network/time permits — flagged for follow-up, not a blocker).
3. **Resumable downloads partial-file race.** Two concurrent download invocations for the same model id. Mitigation: `activeDownloads: Map<ModelId, AbortController>` (already in GrammarDiff) prevents double-start within a process; cross-process is impossible because Daily is a single-instance Electron app.
4. **SHA256 drift on Hugging Face.** Mirror or model owner re-uploads change the SHA. Mitigation: download error message tells the user to update the catalog; this is acceptable for a pre-production app.

## Self-review checklist (run before requesting user review)

- [x] No `TBD` / `TODO` in the spec body — provisional catalog values are explicitly resolved at plan execution, not deferred forever.
- [x] No internal contradictions between architecture and phase plan.
- [x] Scope is one branch / one plan: catalog refactor + binary upgrade + hardening primitives. Agentic loop, MCP, sync — out of scope.
- [x] Ambiguities resolved: `tier` is explicitly mapped to prompt tier; `unloadModel` default is `"15m"`; SHA256 is mandatory in the catalog (validator rejects entries without it once Phase 3 lands — Phase 1 catalog can omit it transiently).

## Implementation notes for the next session

- Start by creating the branch: `git checkout -b feat/local-model-migration` (off `feat/agentic`).
- This spec lives at `docs/superpowers/specs/2026-06-06-local-model-migration.md`; the implementation plan goes alongside under `docs/superpowers/plans/`.
- The plan should be one file per phase or one file covering all phases (writing-plans skill decides). I lean toward one comprehensive plan since the phases are tightly coupled around the JSON catalog refactor.
- **Reference source is in-repo**: read from `migration_assets/GrammarDiff/` — do not depend on absolute paths outside the repo. This makes the plan reproducible on any machine and survives worktree / clone scenarios.
- After merge, `migration_assets/` can be deleted in a cleanup commit (history preserves it).
