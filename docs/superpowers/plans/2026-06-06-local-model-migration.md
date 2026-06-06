# Local Model Stack Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port every local-model-infrastructure improvement from the vendored GrammarDiff snapshot (`migration_assets/GrammarDiff/`) into Daily, plus upgrade llama.cpp `b5200` → `b9374` and refresh the model catalog to agent-friendly models (Qwen3 4B / Hermes 3 8B / Qwen3 14B).

**Architecture:** JSON catalog (`resources/models.json`) becomes the single source of truth for models. `ModelService` loads/validates it. SHA256 verification at every download boundary (binary + GGUF). Resumable downloads via `.download` partial + HTTP `Range`. Idle unload via `setInterval` + `Settings.ai.unloadModel`. `AIController` accepts DI, dedups concurrent server starts via `ensurePromise`, correctly unloads server when deleting the active model.

**Tech Stack:** Existing Daily (Electron 36, Vue 3, TypeScript, better-sqlite3). Same llama-server subprocess pattern, new binary version. No new dependencies.

**Spec source:** [2026-06-06-local-model-migration.md](../specs/2026-06-06-local-model-migration.md). Vendored reference: [migration_assets/GrammarDiff/](../../../migration_assets/GrammarDiff/).

---

## Conventions

- **TDD** for every behavioral change. Validator, downloader, services, controller logic.
- **Commit per task.** Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- **Test command shorthand:** `pnpm evitest run <path>` for one file, `pnpm test:main` for the main suite, `pnpm test` for everything.
- **Gate per phase:** `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`. After Phase 2, also `pnpm evitest run tests/main/ai/evals/`.
- **Branch:** all work on `feat/local-model-migration` (created in Phase 0). Do NOT merge into main during this plan. Final integration via the broader merge of `feat/agentic` + this branch into main, after manual testing — out of scope of this plan.
- **Read the vendored reference often.** When porting `LlamaServer` / `ModelService` / `downloadWithProgress`, open the corresponding file in `migration_assets/GrammarDiff/` side-by-side. The reference shows the exact shape we want.

---

## Phase 0: Branch setup

**Files:** none (git only).

- [ ] **Step 1: Verify clean working tree on `feat/agentic`**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: branch `feat/agentic`, clean tree. If dirty, stash before continuing.

- [ ] **Step 2: Cut new branch**

```bash
git checkout -b feat/local-model-migration
```

- [ ] **Step 3: Sanity check tests still green**

```bash
pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular
```

Expected: all green (this is the same gate as end-of-`feat/agentic` work — 483 tests).

No commit at this phase. Done when branch is ready.

---

## Phase 1: JSON catalog + validator + `tier` field

**Approach:** Pure structural refactor. After this phase, behavior is identical — same three models (`daily-fast` / `daily-balanced` / `daily-quality`), same prompt tier mapping. Only the _source_ of the catalog changes from a hardcoded TS const to a validated JSON file.

**Files:**

- Create: `resources/models.json`
- Create: `src/main/ai/clients/local/core/catalog.ts`
- Create: `tests/main/ai/clients/local/catalog.test.ts`
- Modify: `src/main/ai/clients/local/core/manifest.ts` — remove `MODEL_MANIFEST`, remove `getManifestEntry`, keep `SERVER_BINARY`.
- Modify: `src/main/ai/clients/local/types.ts` — `ModelManifestEntry`: add `tier`, remove `promptTier`.
- Modify: `src/shared/types/ai.ts` — `LocalModelInfo`: add optional `tier`, `accuracy`, `speed`.
- Modify: `src/main/ai/clients/local/core/LocalModelService.ts` — load catalog via DI; expose `getEntry(id)`, `getCatalog()`.
- Modify: `src/main/ai/clients/local/LocalClient.ts` — use `modelService.getEntry()` instead of `getManifestEntry`.
- Modify: `src/main/ai/AIController.ts` — `resolvePromptTier`: for local provider, look up `tier` via `localClient.modelService.getEntry(id)?.tier` and map to prompt tier.
- Modify: `src/main/config.ts` — add `fsPaths.modelsCatalogPath()`.
- Modify: `electron-builder.json` — include `resources/models.json` in package via `extraResources`.
- Modify: `electron.vite.config.ts` (if needed) — ensure dev mode reads catalog from `resources/`.

### Task 1: Add `fsPaths.modelsCatalogPath()` and ship `resources/models.json` (current models)

- [ ] **Step 1: Add path helper**

In `src/main/config.ts`, append to `fsPaths`:

```ts
  /** Bundled models catalog (JSON) */
  modelsCatalogPath: () =>
    ENV.isDevelopment
      ? join(process.cwd(), "resources", "models.json")
      : join(app.getAppPath(), "resources", "models.json"),
```

- [ ] **Step 2: Create initial `resources/models.json` with current Daily models**

This file must be **byte-identical in semantics** to the existing `MODEL_MANIFEST` to keep behavior unchanged in Phase 1. SHA256 is `null` initially (validator accepts that in v1) — Phase 3 introduces required SHA256, Phase 2 fills them with real values.

Create `resources/models.json`:

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "daily-fast",
      "title": "Minimal",
      "description": "Stronger baseline for everyday agent tasks with tools",
      "tier": "fast",
      "sizeBytes": 2080000000,
      "requirements": {"ramGb": 6, "diskGb": 3},
      "ggufUrl": "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
      "ggufFilename": "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
      "sha256": null,
      "serverArgs": {"ctx": 4096, "gpuLayers": 99, "temperature": 0.3},
      "recommended": false,
      "accuracy": null
    },
    {
      "id": "daily-balanced",
      "title": "Balanced",
      "description": "Balanced speed/quality profile",
      "tier": "balanced",
      "sizeBytes": 4370000000,
      "requirements": {"ramGb": 8, "diskGb": 6},
      "ggufUrl": "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
      "ggufFilename": "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
      "sha256": null,
      "serverArgs": {"ctx": 8192, "gpuLayers": 99, "temperature": 0.3},
      "recommended": true,
      "accuracy": null
    },
    {
      "id": "daily-quality",
      "title": "Quality",
      "description": "Highest quality local profile, requires high memory and storage",
      "tier": "quality",
      "sizeBytes": 26440000000,
      "requirements": {"ramGb": 32, "diskGb": 30},
      "ggufUrl": "https://huggingface.co/TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf",
      "ggufFilename": "mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf",
      "sha256": null,
      "serverArgs": {"ctx": 8192, "gpuLayers": 99, "temperature": 0.3},
      "recommended": false,
      "accuracy": null
    }
  ]
}
```

- [ ] **Step 3: Ensure electron-builder packages `resources/models.json`**

In `electron-builder.json`, append to `extraResources`:

```json
  "extraResources": [
    {"from": "resources/file-coordinator", "to": "file-coordinator"},
    {"from": "resources/models.json", "to": "resources/models.json"}
  ]
```

- [ ] **Step 4: Verify dev resolution**

```bash
node -e "console.log(require('path').join(process.cwd(), 'resources', 'models.json'))"
ls -la resources/models.json
```

Expected: file resolves and exists.

- [ ] **Step 5: Commit**

```bash
git add resources/models.json src/main/config.ts electron-builder.json
git commit -m "feat(ai): add resources/models.json + fsPaths.modelsCatalogPath()"
```

### Task 2: Create `catalog.ts` (loader + validator)

- [ ] **Step 1: Write failing test**

Create `tests/main/ai/clients/local/catalog.test.ts`:

```ts
// @ts-nocheck
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {loadCatalog} from "@main/ai/clients/local/core/catalog"

function withTmpFile(content: string, fn: (path: string) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "catalog-test-"))
  const file = join(dir, "models.json")
  writeFileSync(file, content)
  return Promise.resolve(fn(file)).finally(() => rmSync(dir, {recursive: true, force: true}))
}

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

describe("loadCatalog", () => {
  it("loads a well-formed catalog", async () => {
    await withTmpFile(
      JSON.stringify({
        schemaVersion: 1,
        models: [
          {
            id: "x",
            title: "X",
            description: "x",
            tier: "fast",
            sizeBytes: 1000,
            requirements: {ramGb: 1, diskGb: 1},
            ggufUrl: "https://example/x.gguf",
            ggufFilename: "x.gguf",
            sha256: null,
            serverArgs: {ctx: 1024, gpuLayers: 99, temperature: 0.1},
            recommended: true,
            accuracy: null,
          },
        ],
      }),
      async (file) => {
        const out = await loadCatalog(file)
        expect(out).toHaveLength(1)
        expect(out[0].id).toBe("x")
        expect(out[0].tier).toBe("fast")
        expect(out[0].recommended).toBe(true)
      },
    )
  })

  it("rejects unknown schemaVersion", async () => {
    await withTmpFile(JSON.stringify({schemaVersion: 99, models: []}), async (file) => {
      const out = await loadCatalog(file)
      expect(out).toEqual([])
    })
  })

  it("skips entries with missing required fields", async () => {
    await withTmpFile(
      JSON.stringify({
        schemaVersion: 1,
        models: [
          {
            id: "good",
            title: "G",
            description: "g",
            tier: "fast",
            sizeBytes: 1,
            requirements: {ramGb: 1, diskGb: 1},
            ggufUrl: "u",
            ggufFilename: "f",
            sha256: null,
            serverArgs: {ctx: 1, gpuLayers: 1, temperature: 0.1},
            accuracy: null,
          },
          {
            id: "bad-no-tier",
            title: "B",
            description: "b",
            sizeBytes: 1,
            requirements: {ramGb: 1, diskGb: 1},
            ggufUrl: "u",
            ggufFilename: "f",
            sha256: null,
            serverArgs: {ctx: 1, gpuLayers: 1, temperature: 0.1},
            accuracy: null,
          },
        ],
      }),
      async (file) => {
        const out = await loadCatalog(file)
        expect(out.map((e) => e.id)).toEqual(["good"])
      },
    )
  })

  it("rejects invalid tier values", async () => {
    await withTmpFile(
      JSON.stringify({
        schemaVersion: 1,
        models: [
          {
            id: "x",
            title: "X",
            description: "x",
            tier: "ultra",
            sizeBytes: 1,
            requirements: {ramGb: 1, diskGb: 1},
            ggufUrl: "u",
            ggufFilename: "f",
            sha256: null,
            serverArgs: {ctx: 1, gpuLayers: 1, temperature: 0.1},
            accuracy: null,
          },
        ],
      }),
      async (file) => {
        const out = await loadCatalog(file)
        expect(out).toEqual([])
      },
    )
  })

  it("returns empty array when file missing", async () => {
    const out = await loadCatalog("/nonexistent/path.json")
    expect(out).toEqual([])
  })

  it("returns empty array when JSON is malformed", async () => {
    await withTmpFile("not-json{", async (file) => {
      const out = await loadCatalog(file)
      expect(out).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm evitest run tests/main/ai/clients/local/catalog.test.ts
```

Expected: FAIL with "Cannot find module @main/ai/clients/local/core/catalog".

- [ ] **Step 3: Implement `catalog.ts`**

The implementation mirrors `migration_assets/GrammarDiff/src/main/ai/catalog.ts` but adapted to Daily's schemaVersion + tier shape.

Create `src/main/ai/clients/local/core/catalog.ts`:

```ts
import fs from "fs-extra"

import {logger} from "@/utils/logger"

import type {ModelManifestEntry} from "../types"

const SUPPORTED_SCHEMA_VERSION = 1
const VALID_TIERS = new Set(["fast", "balanced", "quality"])

type RawCatalog = {schemaVersion?: number; models?: unknown[]}

export async function loadCatalog(filePath: string): Promise<ModelManifestEntry[]> {
  let raw: RawCatalog
  try {
    raw = JSON.parse(await fs.readFile(filePath, "utf8")) as RawCatalog
  } catch (err) {
    logger.error(logger.CONTEXT.AI, "Failed to read model catalog", {filePath, error: err})
    return []
  }

  if (raw?.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    logger.error(logger.CONTEXT.AI, "Unsupported catalog schemaVersion", {
      filePath,
      got: raw?.schemaVersion,
      expected: SUPPORTED_SCHEMA_VERSION,
    })
    return []
  }

  if (!Array.isArray(raw.models)) {
    logger.error(logger.CONTEXT.AI, "Catalog 'models' is not an array", {filePath})
    return []
  }

  const out: ModelManifestEntry[] = []
  raw.models.forEach((item, index) => {
    const entry = parseEntry(item, index)
    if (entry) out.push(entry)
  })
  return out
}

function parseEntry(raw: unknown, index: number): ModelManifestEntry | null {
  const reject = (reason: string): null => {
    logger.warn(logger.CONTEXT.AI, "Skipping invalid catalog entry", {index, reason})
    return null
  }
  const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
  const inUnitOrNull = (v: unknown): v is number | null => v === null || (isNum(v) && v >= 0 && v <= 1)

  if (typeof raw !== "object" || raw === null) return reject("not an object")
  const e = raw as Record<string, unknown>

  const id = e.id
  if (!isStr(id)) return reject("id")
  const title = e.title
  if (!isStr(title)) return reject(`${id}: title`)
  const description = e.description
  if (!isStr(description)) return reject(`${id}: description`)
  const tier = e.tier
  if (!isStr(tier) || !VALID_TIERS.has(tier)) return reject(`${id}: tier`)
  const ggufUrl = e.ggufUrl
  if (!isStr(ggufUrl)) return reject(`${id}: ggufUrl`)
  const ggufFilename = e.ggufFilename
  if (!isStr(ggufFilename)) return reject(`${id}: ggufFilename`)
  const sizeBytes = e.sizeBytes
  if (!isNum(sizeBytes) || sizeBytes <= 0) return reject(`${id}: sizeBytes`)

  const req = e.requirements as Record<string, unknown> | undefined
  const ramGb = req?.ramGb
  const diskGb = req?.diskGb
  if (!isNum(ramGb) || !isNum(diskGb)) return reject(`${id}: requirements`)

  const sa = e.serverArgs as Record<string, unknown> | undefined
  const ctx = sa?.ctx
  const gpuLayers = sa?.gpuLayers
  const temperature = sa?.temperature
  if (!isNum(ctx) || !isNum(gpuLayers) || !isNum(temperature)) return reject(`${id}: serverArgs`)

  if (e.sha256 !== null && e.sha256 !== undefined && !isStr(e.sha256)) return reject(`${id}: sha256`)
  if (!inUnitOrNull(e.accuracy)) return reject(`${id}: accuracy`)
  if (e.recommended !== undefined && typeof e.recommended !== "boolean") return reject(`${id}: recommended`)

  const entry: ModelManifestEntry = {
    id: id as ModelManifestEntry["id"],
    title,
    description,
    tier: tier as ModelManifestEntry["tier"],
    sizeBytes,
    requirements: {ramGb, diskGb},
    ggufUrl,
    ggufFilename,
    sha256: isStr(e.sha256) ? e.sha256 : null,
    serverArgs: {ctx, gpuLayers, temperature},
    accuracy: typeof e.accuracy === "number" ? e.accuracy : null,
    recommended: e.recommended === true,
  }
  return entry
}
```

- [ ] **Step 4: Update `types.ts` to add `tier`/`sha256`/`accuracy`, remove `promptTier`**

Replace contents of `src/main/ai/clients/local/types.ts` with:

```ts
import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo, LocalRuntimeParams} from "@shared/types/ai"

export type ModelTier = "fast" | "balanced" | "quality"

export type ModelManifestEntry = {
  id: LocalModelId
  title: string
  description: string
  tier: ModelTier
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  ggufUrl: string
  ggufFilename: string
  sha256: string | null
  serverArgs: Required<Pick<LocalRuntimeParams, "ctx" | "gpuLayers" | "temperature">>
  accuracy: number | null
  recommended?: boolean
}

export interface ILocalModelService {
  init(): Promise<void>
  getEntry(modelId: LocalModelId): ModelManifestEntry | undefined
  getCatalog(): ReadonlyArray<ModelManifestEntry>
  isInstalled(modelId: LocalModelId): Promise<boolean>
  getModelPath(modelId: LocalModelId): string
  listModels(): Promise<LocalModelInfo[]>
  downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean>
  cancelDownload(modelId: LocalModelId): Promise<boolean>
  deleteModel(modelId: LocalModelId): Promise<boolean>
  getDiskUsage(): Promise<{total: number; models: Record<string, number>}>
}
```

- [ ] **Step 5: Run catalog tests**

```bash
pnpm evitest run tests/main/ai/clients/local/catalog.test.ts
```

Expected: 6 pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/clients/local/core/catalog.ts src/main/ai/clients/local/types.ts tests/main/ai/clients/local/catalog.test.ts
git commit -m "feat(ai): add JSON catalog loader with schema validation and tier field"
```

### Task 3: Rewire `LocalModelService` to use the catalog (DI-able)

- [ ] **Step 1: Refactor `LocalModelService` constructor + replace `MODEL_MANIFEST`**

Edit `src/main/ai/clients/local/core/LocalModelService.ts`. Replace the entire file with:

```ts
import {stat} from "node:fs/promises"
import path from "node:path"
import fs from "fs-extra"

import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {loadCatalog} from "./catalog"

import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo} from "@shared/types/ai"
import type {ILocalModelService, ModelManifestEntry} from "../types"

export class LocalModelService implements ILocalModelService {
  private readonly modelsDir: string
  private readonly injectedCatalog: ModelManifestEntry[] | null
  private catalog: ModelManifestEntry[] = []
  private activeDownloads = new Map<string, AbortController>()

  constructor(modelsDir?: string, catalog?: ModelManifestEntry[]) {
    this.modelsDir = modelsDir ?? fsPaths.modelsPath()
    this.injectedCatalog = catalog ?? null
  }

  async init(): Promise<void> {
    this.catalog = this.injectedCatalog ?? (await loadCatalog(fsPaths.modelsCatalogPath()))
    await fs.ensureDir(this.modelsDir)
    await this.cleanupOrphanedModels()
  }

  getEntry(modelId: LocalModelId): ModelManifestEntry | undefined {
    return this.catalog.find((m) => m.id === modelId)
  }

  getCatalog(): ReadonlyArray<ModelManifestEntry> {
    return this.catalog
  }

  private async cleanupOrphanedModels(): Promise<void> {
    const knownGguf = new Set(this.catalog.map((entry) => entry.ggufFilename))
    const files = await fs.readdir(this.modelsDir)
    const orphans = files.filter((file) => file.toLowerCase().endsWith(".gguf") && !knownGguf.has(file))
    for (const file of orphans) {
      await fs.remove(path.join(this.modelsDir, file))
      logger.info(logger.CONTEXT.AI, "Removed orphaned local model file", {file})
    }
  }

  async isInstalled(modelId: LocalModelId): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) return false
    return fs.pathExists(this.getModelPath(modelId))
  }

  getModelPath(modelId: LocalModelId): string {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)
    return path.join(this.modelsDir, entry.ggufFilename)
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const results: LocalModelInfo[] = []
    for (const entry of this.catalog) {
      const installed = await this.isInstalled(entry.id)
      results.push({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        sizeBytes: entry.sizeBytes,
        requirements: entry.requirements,
        installed,
        recommended: entry.recommended,
      })
    }
    return results
  }

  async downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)

    if (await this.isInstalled(modelId)) {
      logger.info(logger.CONTEXT.AI, "Model already installed", {modelId})
      return true
    }

    if (this.activeDownloads.has(modelId)) {
      logger.info(logger.CONTEXT.AI, "Download already in progress", {modelId})
      return false
    }

    await fs.ensureDir(this.modelsDir)
    const abortController = new AbortController()
    this.activeDownloads.set(modelId, abortController)

    try {
      await downloadWithProgress({
        url: entry.ggufUrl,
        destPath: this.getModelPath(modelId),
        signal: abortController.signal,
        onProgress: (downloadedBytes, totalBytes) => {
          const total = totalBytes || entry.sizeBytes
          onProgress({
            modelId,
            percent: total > 0 ? Math.round((downloadedBytes / total) * 100) : 0,
            downloadedBytes,
            totalBytes: total,
          })
        },
      })
      logger.info(logger.CONTEXT.AI, "Model downloaded successfully", {modelId})
      return true
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.info(logger.CONTEXT.AI, "Model download cancelled", {modelId})
        return false
      }
      logger.error(logger.CONTEXT.AI, "Model download failed", {modelId, error: err})
      throw err
    } finally {
      this.activeDownloads.delete(modelId)
    }
  }

  async cancelDownload(modelId: LocalModelId): Promise<boolean> {
    const controller = this.activeDownloads.get(modelId)
    if (!controller) return false
    controller.abort()
    this.activeDownloads.delete(modelId)
    return true
  }

  async deleteModel(modelId: LocalModelId): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) return false
    const modelPath = this.getModelPath(modelId)
    if (!(await fs.pathExists(modelPath))) return false
    await fs.remove(modelPath)
    logger.info(logger.CONTEXT.AI, "Model deleted", {modelId})
    return true
  }

  async getDiskUsage(): Promise<{total: number; models: Record<string, number>}> {
    const models: Record<string, number> = {}
    let total = 0
    for (const entry of this.catalog) {
      const modelPath = path.join(this.modelsDir, entry.ggufFilename)
      if (await fs.pathExists(modelPath)) {
        const s = await stat(modelPath)
        models[entry.id] = s.size
        total += s.size
      }
    }
    return {total, models}
  }
}
```

- [ ] **Step 2: Remove `MODEL_MANIFEST` and `getManifestEntry` from `manifest.ts`**

Edit `src/main/ai/clients/local/core/manifest.ts`. Replace contents with:

```ts
export const SERVER_BINARY = {
  version: "b5200",
  macos: {
    arm64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b5200/llama-b5200-bin-macos-arm64.zip",
      size: 50_000_000,
    },
    x64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b5200/llama-b5200-bin-macos-x64.zip",
      size: 50_000_000,
    },
  },
} as const
```

(Phase 2 will replace this with `b9374` + SHA256s + .tar.gz.)

- [ ] **Step 3: Update consumers**

In `src/main/ai/clients/local/LocalClient.ts`, replace `import {getManifestEntry} from "./core/manifest"` with NOTHING — the import goes away. Replace every `getManifestEntry(modelId)` call with `this.modelService.getEntry(modelId)`. Note: the LocalClient already has `this.modelService` (it's the public `readonly modelService: LocalModelService`).

Find the existing usage in `LocalClient.ts`:

```ts
// Before
const manifest = getManifestEntry(modelId)
```

Replace with:

```ts
const manifest = this.modelService.getEntry(modelId)
```

In `src/main/ai/AIController.ts`, replace the import `import {getManifestEntry} from "@/ai/clients/local/core/manifest"` with nothing. Then in `resolvePromptTier`:

```ts
// Before
if (config?.provider === "local") {
  const modelId = config.local?.model
  if (!modelId) return "medium"
  return getManifestEntry(modelId)?.promptTier ?? "medium"
}

// After
if (config?.provider === "local") {
  const modelId = config.local?.model
  if (!modelId) return "medium"
  const entry = this.localClient.modelService.getEntry(modelId)
  if (!entry) return "medium"
  return tierToPromptTier(entry.tier)
}
```

Add helper at the bottom of `AIController.ts` (top-level function in the module):

```ts
function tierToPromptTier(tier: "fast" | "balanced" | "quality"): PromptTier {
  if (tier === "fast") return "tiny"
  if (tier === "balanced") return "medium"
  return "large"
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck:main
```

Expected: no errors. If any consumer still imports `MODEL_MANIFEST` or `getManifestEntry`, the typechecker will name them — fix each.

- [ ] **Step 5: Run main suite**

```bash
pnpm test:main
```

Expected: all pass (behavior unchanged; catalog content is identical to old `MODEL_MANIFEST`).

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/clients/local/core/manifest.ts src/main/ai/clients/local/core/LocalModelService.ts src/main/ai/clients/local/LocalClient.ts src/main/ai/AIController.ts
git commit -m "refactor(ai): load model catalog from JSON via LocalModelService"
```

### Task 4: Phase 1 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

Expected: green. No new tests broken.

---

## Phase 2: llama.cpp upgrade + new agent catalog + binary SHA256

**Approach:** Bump `SERVER_BINARY` to `b9374`, change archive format from `.zip` to `.tar.gz`, add SHA256 verification for the archive. Replace catalog contents with three new agent-friendly models. After this phase, behavior changes: new binary + new models. Run the eval suite to catch tool-calling regressions.

**Files:**

- Modify: `src/main/ai/clients/local/core/manifest.ts` — `SERVER_BINARY` bumped to `b9374`, `.tar.gz`, with `sha256` per arch.
- Modify: `src/main/ai/clients/local/core/LlamaServer.ts` — verify archive SHA256, switch from `unzip` to `tar`, fix `--flash-attn on` syntax.
- Modify: `resources/models.json` — new models: Qwen3 4B Instruct / Hermes 3 8B / Qwen3 14B Instruct.
- Modify: `src/shared/types/ai.ts` — `LocalModelId` becomes `string` (not a union) since IDs are now data-driven.

### Task 1: Fetch SHA256s and model metadata

This task is **mechanical** — run commands, paste outputs.

- [ ] **Step 1: Fetch llama-server `b9374` binary URLs and SHA256s**

```bash
mkdir -p /tmp/llama-bin
cd /tmp/llama-bin

curl -sL -o llama-arm64.tar.gz "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-arm64.tar.gz"
shasum -a 256 llama-arm64.tar.gz
ls -la llama-arm64.tar.gz

curl -sL -o llama-x64.tar.gz "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-x64.tar.gz"
shasum -a 256 llama-x64.tar.gz
ls -la llama-x64.tar.gz
```

Record both SHA256 hex strings and file sizes. If `b9374` is no longer the latest stable release at execution time, pick the latest stable equivalent (look at https://github.com/ggml-org/llama.cpp/releases) and substitute the version string throughout this phase.

- [ ] **Step 2: Resolve GGUF URLs for each model**

Verify each URL works (no redirect to a 404 page, returns a binary stream with `content-length`):

```bash
# Qwen3 4B Instruct
curl -sIL "https://huggingface.co/bartowski/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf" | grep -iE "^(HTTP|content-length|content-type)"

# Hermes 3 Llama 3.1 8B
curl -sIL "https://huggingface.co/bartowski/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B-Q4_K_M.gguf" | grep -iE "^(HTTP|content-length|content-type)"

# Qwen3 14B Instruct
curl -sIL "https://huggingface.co/bartowski/Qwen3-14B-Instruct-2507-GGUF/resolve/main/Qwen3-14B-Instruct-2507-Q4_K_M.gguf" | grep -iE "^(HTTP|content-length|content-type)"
```

If any URL 404s, adjust the filename — Bartowski's naming convention may differ. For example: try `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF` or `lmstudio-community/Qwen3-4B-Instruct-2507-GGUF`. Record the working URL.

- [ ] **Step 3: Fetch SHA256 for each model**

These files are large (2.5 / 5 / 9 GB). Fetch one at a time, hash, delete:

```bash
mkdir -p /tmp/gguf
cd /tmp/gguf

for URL in \
  "<resolved Qwen3 4B URL>" \
  "<resolved Hermes 3 8B URL>" \
  "<resolved Qwen3 14B URL>" \
; do
  NAME=$(basename "$URL")
  echo "Downloading $NAME …"
  curl -sL -o "$NAME" "$URL"
  echo "$NAME size: $(stat -f%z "$NAME" 2>/dev/null || stat -c%s "$NAME")"
  echo "$NAME sha256: $(shasum -a 256 "$NAME" | awk '{print $1}')"
  rm -f "$NAME"
done
```

Record each `(filename, size in bytes, sha256)` triple.

> **Time/network budget:** combined download is ~16 GB. Plan ~30–60 minutes on a fast connection. If the subagent doing this step has no network or limited bandwidth, the human operator runs these commands and provides the results.

- [ ] **Step 4: Commit nothing yet** — proceed to Task 2 with the gathered values.

### Task 2: Bump `SERVER_BINARY` (version, sha256, .tar.gz)

- [ ] **Step 1: Replace `manifest.ts`**

Edit `src/main/ai/clients/local/core/manifest.ts`. Replace contents with:

```ts
export const SERVER_BINARY = {
  version: "b9374",
  macos: {
    arm64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-arm64.tar.gz",
      sizeBytes: <SIZE_FROM_TASK_1_STEP_1>,
      sha256: "<ARM64_SHA256_FROM_TASK_1_STEP_1>",
    },
    x64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b9374/llama-b9374-bin-macos-x64.tar.gz",
      sizeBytes: <SIZE_FROM_TASK_1_STEP_1>,
      sha256: "<X64_SHA256_FROM_TASK_1_STEP_1>",
    },
  },
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ai/clients/local/core/manifest.ts
git commit -m "feat(ai): bump llama.cpp to b9374 with sha256 and .tar.gz"
```

### Task 3: Update `LlamaServer.ts` (SHA256 check, tar.gz, --flash-attn on)

- [ ] **Step 1: Patch `ensureBinary` to verify SHA256 and use tar**

Open `src/main/ai/clients/local/core/LlamaServer.ts` side-by-side with `migration_assets/GrammarDiff/src/main/ai/LlamaServer.ts` for reference. Make the following changes:

**(a) Add `sha256File` helper at the top of the file** (after imports):

```ts
import {createHash} from "node:crypto"
import {createReadStream} from "node:fs"

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(filePath), hash)
  return hash.digest("hex")
}
```

**(b) Inside `ensureBinary()`, after downloading the archive to `zipPath`, add SHA256 check.** Replace the existing block that downloads to `zipPath` and then calls `execFileAsync("unzip", ...)` with:

```ts
logger.info(logger.CONTEXT.AI, "Downloading llama-server binary", {arch})

await fs.ensureDir(fsPaths.binPath())

const archivePath = path.join(fsPaths.binPath(), "llama-server.tar.gz")

const response = await fetch(binaryInfo.url, {redirect: "follow"})
if (!response.ok || !response.body) {
  throw new Error(`Failed to download llama-server: HTTP ${response.status}`)
}

const nodeStream = Readable.fromWeb(response.body as any)
const writeStream = createWriteStream(archivePath)
await pipeline(nodeStream, writeStream)

const actualSha = await sha256File(archivePath)
if (actualSha !== binaryInfo.sha256) {
  await unlink(archivePath).catch(() => {})
  throw new Error(`llama-server checksum mismatch: expected ${binaryInfo.sha256}, got ${actualSha}`)
}

const extractDir = path.join(fsPaths.binPath(), "_extract")
await fs.ensureDir(extractDir)

try {
  await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir])

  const {stdout} = await execFileAsync("find", [extractDir, "-name", "llama-server", "-type", "f"])
  const binarySource = stdout.trim().split("\n")[0]
  if (!binarySource) throw new Error("llama-server binary not found in archive")

  const sourceDir = path.dirname(binarySource)
  const files = await readdir(sourceDir)
  for (const file of files) {
    await rename(path.join(sourceDir, file), path.join(fsPaths.binPath(), file))
  }
} finally {
  try {
    await fs.remove(extractDir)
  } catch {
    void 0
  }
  try {
    await unlink(archivePath)
  } catch {
    void 0
  }
}
```

**(c) Fix `--flash-attn` syntax.** In `start()`, find this line:

```ts
"--flash-attn",
"--cont-batching",
```

Replace with:

```ts
"--flash-attn",
"on",
"--cont-batching",
```

**(d) Remove `--cache-reuse` and `--mlock` if not present already** — they remain valid in `b9374`, no action.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck:main
```

Expected: no errors. `binaryInfo.size` → `binaryInfo.sizeBytes` if you renamed; also rename in any consumer (search).

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/clients/local/core/LlamaServer.ts
git commit -m "feat(ai): verify llama-server archive sha256, switch to tar.gz, fix --flash-attn on"
```

### Task 4: Replace catalog contents with new models

- [ ] **Step 1: Make `LocalModelId` data-driven**

Edit `src/shared/types/ai.ts`. Replace:

```ts
export type LocalModelId = "daily-fast" | "daily-balanced" | "daily-quality"
```

With:

```ts
export type LocalModelId = string
```

Also remove the default model in `src/main/config.ts` if it's currently `"daily-balanced"`:

```ts
// Before
local: {
  model: "daily-balanced",
},

// After
local: {
  model: "qwen3-4b-instruct",
},
```

(Default to the lightest tier so new installs don't try to download a 9 GB file. Users override in Settings.)

- [ ] **Step 2: Replace `resources/models.json`**

Write the new catalog using values gathered in Task 1. Schema (fill `<…>` placeholders with real values from Task 1):

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "qwen3-4b-instruct",
      "title": "Qwen3 4B Instruct",
      "description": "Fast everyday model with strong function calling.",
      "tier": "fast",
      "sizeBytes": <SIZE_QWEN3_4B>,
      "requirements": {"ramGb": 6, "diskGb": 3},
      "ggufUrl": "<URL_QWEN3_4B>",
      "ggufFilename": "<FILENAME_QWEN3_4B>",
      "sha256": "<SHA256_QWEN3_4B>",
      "serverArgs": {"ctx": 8192, "gpuLayers": 99, "temperature": 0.3},
      "recommended": false,
      "accuracy": 0.7
    },
    {
      "id": "hermes-3-llama-3.1-8b",
      "title": "Hermes 3 Llama 3.1 8B",
      "description": "Fine-tuned for tool calling — recommended default.",
      "tier": "balanced",
      "sizeBytes": <SIZE_HERMES_3>,
      "requirements": {"ramGb": 10, "diskGb": 6},
      "ggufUrl": "<URL_HERMES_3>",
      "ggufFilename": "<FILENAME_HERMES_3>",
      "sha256": "<SHA256_HERMES_3>",
      "serverArgs": {"ctx": 8192, "gpuLayers": 99, "temperature": 0.3},
      "recommended": true,
      "accuracy": 0.82
    },
    {
      "id": "qwen3-14b-instruct",
      "title": "Qwen3 14B Instruct",
      "description": "High-quality, slower. Best for complex multi-step tasks.",
      "tier": "quality",
      "sizeBytes": <SIZE_QWEN3_14B>,
      "requirements": {"ramGb": 16, "diskGb": 12},
      "ggufUrl": "<URL_QWEN3_14B>",
      "ggufFilename": "<FILENAME_QWEN3_14B>",
      "sha256": "<SHA256_QWEN3_14B>",
      "serverArgs": {"ctx": 16384, "gpuLayers": 99, "temperature": 0.3},
      "recommended": false,
      "accuracy": 0.9
    }
  ]
}
```

- [ ] **Step 3: Run main suite**

```bash
pnpm test:main
```

Expected: all pass. The catalog tests in Task 2 of Phase 1 use synthetic in-tmp JSON, so they don't care about the real catalog content. AIController tests mock storage; settings change to default model is opaque to them.

- [ ] **Step 4: Commit**

```bash
git add resources/models.json src/shared/types/ai.ts src/main/config.ts
git commit -m "feat(ai): replace catalog with Qwen3 / Hermes 3 agent-friendly models"
```

### Task 5: Phase 2 gate + agentic eval check

- [ ] **Step 1: Standard gate**

```bash
pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular
```

- [ ] **Step 2: Agent eval check**

```bash
pnpm evitest run tests/main/ai/evals/
```

Expected: 8 eval scenarios pass — they don't depend on the catalog at all (they mock the LLM client).

- [ ] **Step 3: Manual smoke (advisory)**

If a developer machine is available, do an end-to-end smoke:

1. `rm -rf "$HOME/Library/Application Support/Daily/bin" "$HOME/Library/Application Support/Daily/models"` (clean previous binary/models).
2. `pnpm dev`.
3. Settings → AI → switch provider to Local, pick `Qwen3 4B Instruct`, click Download.
4. Wait for download.
5. Open Assistant, send "list tasks for today".
6. Verify the assistant responds via `respond` tool (not raw text) and either lists tasks or asks for clarification — no error states.

This step is advisory: subagents executing the plan may not have the means to run a real binary. The human operator does this before merging the branch.

---

## Phase 3: SHA256 for GGUF + `verifying` phase + `partialBytes`

**Approach:** Add SHA256 verification at the GGUF download boundary and add a new `DownloadPhase` so the UI can render a "verifying" state.

**Files:**

- Modify: `src/main/utils/files/downloadWithProgress.ts` — accept `sha256` and emit `phase: "downloading" | "verifying"`.
- Modify: `src/shared/types/ai.ts` — `LocalModelDownloadProgress` gains `phase`; `LocalModelInfo` gains `partialBytes`.
- Modify: `src/main/ai/clients/local/core/LocalModelService.ts` — pass `entry.sha256` into `downloadWithProgress`; emit `partialBytes` from `listModels()`.
- Create/extend: `tests/main/utils/files/downloadWithProgress.test.ts`.

### Task 1: Extend types

- [ ] **Step 1: Update `src/shared/types/ai.ts`**

Edit `LocalModelDownloadProgress` and `LocalModelInfo`:

```ts
export type DownloadPhase = "downloading" | "verifying"

export type LocalModelDownloadProgress = {
  modelId: LocalModelId
  percent: number
  downloadedBytes: number
  totalBytes: number
  phase: DownloadPhase
}

export type LocalModelInfo = {
  id: LocalModelId
  title: string
  description: string
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  installed: boolean
  recommended?: boolean
  /** Set when a `.download` partial file exists for an uninstalled model. */
  partialBytes?: number
  /** Catalog-provided rough quality score (0..1). */
  accuracy?: number
  /** Catalog-provided tier label (fast / balanced / quality). */
  tier?: "fast" | "balanced" | "quality"
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck:all
```

Expected: errors on consumers that destructure `phase`/`partialBytes` — none exist yet, so should pass.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/ai.ts
git commit -m "feat(ai): add DownloadPhase and partialBytes to local model types"
```

### Task 2: Rewrite `downloadWithProgress` with SHA256 verify

This task replaces the existing implementation. Resumable logic is added in Phase 4 — this phase only adds SHA256 verify and the `phase` callback.

- [ ] **Step 1: Write failing tests**

Create `tests/main/utils/files/downloadWithProgress.test.ts`:

```ts
// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {readFile, stat} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Readable} from "node:stream"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {downloadWithProgress} from "@main/utils/files/downloadWithProgress"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeResponse(body: Buffer, opts: {status?: number; headers?: Record<string, string>} = {}) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(body)
      controller.close()
    },
  })
  return new Response(stream, {
    status: opts.status ?? 200,
    headers: {"content-length": String(body.byteLength), ...opts.headers},
  })
}

describe("downloadWithProgress", () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dl-"))
  })

  it("downloads and renames partial to final on success", async () => {
    const body = Buffer.from("hello world")
    const dest = join(tmp, "out.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    const phases: string[] = []
    await downloadWithProgress({
      url: "https://example/x",
      destPath: dest,
      onProgress: (_d, _t, phase) => {
        if (!phases.includes(phase)) phases.push(phase)
      },
    })

    expect((await readFile(dest)).toString()).toBe("hello world")
    expect(phases).toContain("downloading")
    rmSync(tmp, {recursive: true, force: true})
  })

  it("verifies sha256 and renames on success", async () => {
    const body = Buffer.from("verify-me")
    // sha256("verify-me") computed elsewhere — use Node crypto inline:
    const {createHash} = await import("node:crypto")
    const expected = createHash("sha256").update(body).digest("hex")

    const dest = join(tmp, "v.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    const phases: string[] = []
    await downloadWithProgress({
      url: "https://example/v",
      destPath: dest,
      sha256: expected,
      onProgress: (_d, _t, phase) => phases.push(phase),
    })

    expect(await stat(dest)).toBeTruthy()
    expect(phases).toContain("verifying")
    rmSync(tmp, {recursive: true, force: true})
  })

  it("throws and removes partial on sha256 mismatch", async () => {
    const body = Buffer.from("mismatch")
    const dest = join(tmp, "m.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    await expect(
      downloadWithProgress({
        url: "https://example/m",
        destPath: dest,
        sha256: "0".repeat(64),
        onProgress: () => {},
      }),
    ).rejects.toThrow(/checksum mismatch/i)

    await expect(stat(dest)).rejects.toThrow()
    await expect(stat(`${dest}.download`)).rejects.toThrow()
    rmSync(tmp, {recursive: true, force: true})
  })

  it("throws on non-2xx HTTP status", async () => {
    const dest = join(tmp, "x.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status: 404, statusText: "Not Found"})))
    await expect(downloadWithProgress({url: "https://example/x", destPath: dest, onProgress: () => {}})).rejects.toThrow(/404/)
    rmSync(tmp, {recursive: true, force: true})
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm evitest run tests/main/utils/files/downloadWithProgress.test.ts
```

Expected: FAILs because the existing implementation has no `sha256` param and no `phase` arg.

- [ ] **Step 3: Implement the new download helper**

Replace `src/main/utils/files/downloadWithProgress.ts` with:

```ts
import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {rename, unlink} from "node:fs/promises"
import {Readable, Transform} from "node:stream"
import {pipeline} from "node:stream/promises"

import {logger} from "@/utils/logger"

import type {DownloadPhase} from "@shared/types/ai"

const USER_AGENT = "Daily-App/1.0"

type DownloadParams = {
  url: string
  destPath: string
  onProgress: (downloadedBytes: number, totalBytes: number, phase: DownloadPhase) => void
  sha256?: string | null
  signal?: AbortSignal
}

async function hashFile(p: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(p), hash)
  return hash.digest("hex")
}

export async function downloadWithProgress(params: DownloadParams): Promise<void> {
  const {url, destPath, onProgress, sha256, signal} = params
  const tempPath = `${destPath}.download`

  logger.info(logger.CONTEXT.AI, "Starting download", {url, destPath})

  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: {"User-Agent": USER_AGENT},
  })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error("Download failed: no response body")

  const totalBytes = Number(response.headers.get("content-length") ?? 0)
  let downloadedBytes = 0

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      downloadedBytes += chunk.length
      onProgress(downloadedBytes, totalBytes, "downloading")
      cb(null, chunk)
    },
  })

  try {
    const nodeStream = Readable.fromWeb(response.body as any)
    const writeStream = createWriteStream(tempPath, {flags: "w"})
    await pipeline(nodeStream, counter, writeStream)

    if (sha256) {
      onProgress(downloadedBytes, totalBytes, "verifying")
      const actual = await hashFile(tempPath)
      if (actual !== sha256) {
        await unlink(tempPath).catch(() => {})
        throw new Error(`Checksum mismatch: expected ${sha256}, got ${actual}`)
      }
    }

    await rename(tempPath, destPath)
    logger.info(logger.CONTEXT.AI, "Download completed", {destPath, totalBytes: downloadedBytes})
  } catch (err) {
    if (signal?.aborted) {
      // Keep partial for resume in Phase 4. Phase 3 deletes (same as old behavior).
      try {
        await unlink(tempPath)
      } catch {
        void 0
      }
    }
    throw err
  }
}
```

- [ ] **Step 4: Run download tests**

```bash
pnpm evitest run tests/main/utils/files/downloadWithProgress.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: Wire `sha256` into `LocalModelService.downloadModel`**

Open `src/main/ai/clients/local/core/LocalModelService.ts`. In `downloadModel`, change the `downloadWithProgress` call to:

```ts
await downloadWithProgress({
  url: entry.ggufUrl,
  destPath: this.getModelPath(modelId),
  sha256: entry.sha256,
  signal: abortController.signal,
  onProgress: (downloadedBytes, totalBytes, phase) => {
    const total = totalBytes || entry.sizeBytes
    onProgress({
      modelId,
      percent: total > 0 ? Math.round((downloadedBytes / total) * 100) : 0,
      downloadedBytes,
      totalBytes: total,
      phase,
    })
  },
})
```

- [ ] **Step 6: Add `partialBytes` to `listModels` output**

Update `listModels()` in `LocalModelService.ts`:

```ts
async listModels(): Promise<LocalModelInfo[]> {
  const results: LocalModelInfo[] = []
  for (const entry of this.catalog) {
    const installed = await this.isInstalled(entry.id)
    const info: LocalModelInfo = {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      sizeBytes: entry.sizeBytes,
      requirements: entry.requirements,
      installed,
      recommended: entry.recommended,
      accuracy: entry.accuracy ?? undefined,
      tier: entry.tier,
    }
    if (!installed) {
      const partial = await this.partialBytes(entry)
      if (partial > 0) info.partialBytes = partial
    }
    results.push(info)
  }
  return results
}

private async partialBytes(entry: ModelManifestEntry): Promise<number> {
  try {
    return (await stat(path.join(this.modelsDir, `${entry.ggufFilename}.download`))).size
  } catch {
    return 0
  }
}
```

- [ ] **Step 7: Typecheck + run main tests**

```bash
pnpm typecheck:all && pnpm test:main
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/main/utils/files/downloadWithProgress.ts tests/main/utils/files/downloadWithProgress.test.ts src/main/ai/clients/local/core/LocalModelService.ts
git commit -m "feat(ai): verify GGUF sha256 + emit verifying phase + report partialBytes"
```

### Task 3: Phase 3 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Phase 4: Resumable downloads + orphan `.download` cleanup

**Approach:** Add HTTP `Range` resume to `downloadWithProgress`. Extend `cleanupOrphanedModels` to also remove orphan `.download` files. UI-side changes (Continue button) come in Phase 8.

**Files:**

- Modify: `src/main/utils/files/downloadWithProgress.ts` — `Range` header, 416 handling, partial preserved on interrupt.
- Modify: `src/main/ai/clients/local/core/LocalModelService.ts` — `cleanupOrphanedModels` matches `.download` files.
- Extend: `tests/main/utils/files/downloadWithProgress.test.ts` — resume test.

### Task 1: Resume support in `downloadWithProgress`

- [ ] **Step 1: Add failing test**

Append to `tests/main/utils/files/downloadWithProgress.test.ts`:

```ts
it("resumes from existing .download partial via Range header", async () => {
  const {writeFileSync} = await import("node:fs")
  const total = Buffer.from("0123456789ABCDEFGHIJ") // 20 bytes
  const partial = total.slice(0, 12)
  const remainder = total.slice(12)

  const dest = join(tmp, "r.bin")
  writeFileSync(`${dest}.download`, partial)

  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(remainder)
          c.close()
        },
      }),
      {
        status: 206,
        headers: {"content-length": String(remainder.byteLength), "content-range": `bytes 12-19/${total.byteLength}`},
      },
    ),
  )
  vi.stubGlobal("fetch", fetchSpy)

  await downloadWithProgress({
    url: "https://example/r",
    destPath: dest,
    onProgress: () => {},
  })

  expect((await readFile(dest)).toString()).toBe(total.toString())
  const callArgs = fetchSpy.mock.calls[0][1]
  expect(callArgs.headers.Range).toBe("bytes=12-")
  rmSync(tmp, {recursive: true, force: true})
})

it("falls back to fresh download on 416 (range not satisfiable)", async () => {
  const {writeFileSync} = await import("node:fs")
  const total = Buffer.from("abcdef")
  const dest = join(tmp, "f.bin")
  writeFileSync(`${dest}.download`, Buffer.from("zzzzzzzz"))

  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, {status: 416}))
    .mockResolvedValueOnce(makeResponse(total))
  vi.stubGlobal("fetch", fetchSpy)

  await downloadWithProgress({
    url: "https://example/f",
    destPath: dest,
    onProgress: () => {},
  })

  expect((await readFile(dest)).toString()).toBe("abcdef")
  expect(fetchSpy).toHaveBeenCalledTimes(2)
  rmSync(tmp, {recursive: true, force: true})
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm evitest run tests/main/utils/files/downloadWithProgress.test.ts
```

Expected: 2 new tests fail.

- [ ] **Step 3: Rewrite `downloadWithProgress` with resume**

Replace the file contents with:

```ts
import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {rename, stat, unlink} from "node:fs/promises"
import {Readable, Transform} from "node:stream"
import {pipeline} from "node:stream/promises"

import {logger} from "@/utils/logger"

import type {DownloadPhase} from "@shared/types/ai"

const USER_AGENT = "Daily-App/1.0"

type DownloadParams = {
  url: string
  destPath: string
  onProgress: (downloadedBytes: number, totalBytes: number, phase: DownloadPhase) => void
  sha256?: string | null
  signal?: AbortSignal
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}

async function hashFile(p: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(p), hash)
  return hash.digest("hex")
}

export async function downloadWithProgress(params: DownloadParams): Promise<void> {
  const {url, destPath, onProgress, sha256, signal} = params
  const tempPath = `${destPath}.download`

  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")

  let resumeFrom = await fileSize(tempPath)
  logger.info(logger.CONTEXT.AI, "Starting download", {url, destPath, resumeFrom})

  const headers: Record<string, string> = {"User-Agent": USER_AGENT}
  if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`

  let response = await fetch(url, {signal, redirect: "follow", headers})

  if (response.status === 416) {
    await unlink(tempPath).catch(() => {})
    resumeFrom = 0
    response = await fetch(url, {signal, redirect: "follow", headers: {"User-Agent": USER_AGENT}})
  }

  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error("Download failed: no response body")

  const resumed = response.status === 206 && resumeFrom > 0
  if (!resumed) resumeFrom = 0

  let totalBytes: number
  if (resumed) {
    const range = response.headers.get("content-range")?.split("/")[1]
    totalBytes = range ? Number(range) : resumeFrom + Number(response.headers.get("content-length") ?? 0)
  } else {
    totalBytes = Number(response.headers.get("content-length") ?? 0)
  }

  let downloadedBytes = resumeFrom
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      downloadedBytes += chunk.length
      onProgress(downloadedBytes, totalBytes, "downloading")
      cb(null, chunk)
    },
  })

  const nodeStream = Readable.fromWeb(response.body as any)
  const writeStream = createWriteStream(tempPath, {flags: resumed ? "a" : "w"})
  await pipeline(nodeStream, counter, writeStream)

  if (sha256) {
    onProgress(downloadedBytes, totalBytes, "verifying")
    const actual = await hashFile(tempPath)
    if (actual !== sha256) {
      await unlink(tempPath).catch(() => {})
      throw new Error(`Checksum mismatch: expected ${sha256}, got ${actual}`)
    }
  }

  await rename(tempPath, destPath)
  logger.info(logger.CONTEXT.AI, "Download completed", {destPath, totalBytes: downloadedBytes})
}
```

Key change vs Phase 3: NO `try/catch unlink` on signal abort. The partial file is kept so the next `downloadWithProgress` call resumes.

- [ ] **Step 4: Run download tests**

```bash
pnpm evitest run tests/main/utils/files/downloadWithProgress.test.ts
```

Expected: 6 pass (4 from Phase 3 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/files/downloadWithProgress.ts tests/main/utils/files/downloadWithProgress.test.ts
git commit -m "feat(ai): resumable downloads via Range header with 416 fallback"
```

### Task 2: `cleanupOrphanedModels` covers `.download` files

- [ ] **Step 1: Update `LocalModelService.cleanupOrphanedModels`**

Edit `src/main/ai/clients/local/core/LocalModelService.ts`. Replace `cleanupOrphanedModels`:

```ts
private async cleanupOrphanedModels(): Promise<void> {
  const knownGguf = new Set(this.catalog.map((entry) => entry.ggufFilename))
  const knownPartials = new Set(this.catalog.map((entry) => `${entry.ggufFilename}.download`))
  const files = await fs.readdir(this.modelsDir)
  const orphans = files.filter((file) => {
    const lower = file.toLowerCase()
    if (lower.endsWith(".download")) return !knownPartials.has(file)
    if (lower.endsWith(".gguf")) return !knownGguf.has(file)
    return false
  })
  for (const file of orphans) {
    await fs.remove(path.join(this.modelsDir, file))
    logger.info(logger.CONTEXT.AI, "Removed orphaned model file", {file})
  }
}
```

Also extend `deleteModel` to clean up both files:

```ts
async deleteModel(modelId: LocalModelId): Promise<boolean> {
  const entry = this.getEntry(modelId)
  if (!entry) return false
  const modelPath = this.getModelPath(modelId)
  const partialPath = `${modelPath}.download`
  const hadModel = await fs.pathExists(modelPath)
  const hadPartial = await fs.pathExists(partialPath)
  if (!hadModel && !hadPartial) return false
  if (hadModel) await fs.remove(modelPath)
  if (hadPartial) await fs.remove(partialPath)
  logger.info(logger.CONTEXT.AI, "Model deleted", {modelId, hadModel, hadPartial})
  return true
}
```

- [ ] **Step 2: Run main suite**

```bash
pnpm test:main
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/clients/local/core/LocalModelService.ts
git commit -m "feat(ai): cleanup orphan .download files in LocalModelService"
```

### Task 3: Phase 4 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Phase 5: Idle unload + `Settings.ai.unloadModel`

**Approach:** Settings gains a new key under `ai`. `AIController` runs a 60-second idle check loop; when last activity is older than threshold, calls `localClient.dispose()` (which stops the server). UI gets a new control in Settings → AI.

**Files:**

- Modify: `src/main/ai/clients/local/core/manifest.ts` — add `UNLOAD_OPTION_MS`.
- Modify: `src/shared/types/ai.ts` — `AIConfig.local` gains `unloadModel?: UnloadOption`.
- Modify: `src/main/storage/models/_rowMappers.ts` — default `ai.local.unloadModel = "15m"` (only if AI is enabled; existing default is `ai: null`, so the default applies when settings are first written; we accept missing key → use `"15m"` at read).
- Modify: `src/main/ai/AIController.ts` — `idleTimer` setInterval, `lastActivityAt`, `checkIdle`.
- Modify: `src/renderer/src/ui/views/Settings/{fragments}/AiSettings/{fragments}/SettingsLocal.vue` — add `unloadModel` dropdown.
- Create tests: `tests/main/ai/AIController.idleUnload.test.ts`.

### Task 1: Types + manifest

- [ ] **Step 1: Add `UnloadOption` + `UNLOAD_OPTION_MS`**

Edit `src/main/ai/clients/local/core/manifest.ts`. Append:

```ts
export type UnloadOption = "never" | "5m" | "15m" | "30m"

export const UNLOAD_OPTION_MS: Record<UnloadOption, number | null> = {
  never: null,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
}
```

- [ ] **Step 2: Extend `AIConfig`**

Edit `src/shared/types/ai.ts`. In `AIConfig.local`, add `unloadModel`:

```ts
  local: {
    model: LocalModelId
    params?: LocalRuntimeParams
    availableModels?: string[]
    /** When to unload the model from RAM after inactivity. Default "15m". */
    unloadModel?: "never" | "5m" | "15m" | "30m"
  } | null
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck:all
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/clients/local/core/manifest.ts src/shared/types/ai.ts
git commit -m "feat(ai): add unloadModel option and UNLOAD_OPTION_MS map"
```

### Task 2: Implement idle check in `AIController`

- [ ] **Step 1: Failing test**

Create `tests/main/ai/AIController.idleUnload.test.ts`:

```ts
// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeStorage(unloadModel = "15m") {
  return {
    loadSettings: vi.fn(async () => ({
      ai: {enabled: true, provider: "local", local: {model: "qwen3-4b-instruct", unloadModel}},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

describe("AIController idle unload", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("stops the local server after the configured idle window elapses", async () => {
    const ctrl = new AIController(makeStorage("5m") as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    const isRunning = vi.spyOn(localClient.server, "isRunning").mockReturnValue(true)
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    isRunning // silence unused
    ;(ctrl as any).lastActivityAt = Date.now()

    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(stop).toHaveBeenCalled()
    await ctrl.dispose()
  })

  it("does not stop when unloadModel === 'never'", async () => {
    const ctrl = new AIController(makeStorage("never") as any)
    await ctrl.init()
    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(true)
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    ;(ctrl as any).lastActivityAt = Date.now() - 60 * 60 * 1000 // 1h ago

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

    expect(stop).not.toHaveBeenCalled()
    await ctrl.dispose()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm evitest run tests/main/ai/AIController.idleUnload.test.ts
```

Expected: FAIL — `lastActivityAt` and idle timer don't exist yet.

- [ ] **Step 3: Implement in `AIController`**

Open `src/main/ai/AIController.ts`. Add at the top imports:

```ts
import {UNLOAD_OPTION_MS} from "@/ai/clients/local/core/manifest"

import type {UnloadOption} from "@/ai/clients/local/core/manifest"
```

Add private fields:

```ts
private lastActivityAt = Date.now()
private idleTimer: ReturnType<typeof setInterval> | null = null
```

In `init()`, append at the end (before the return / closing):

```ts
this.idleTimer = setInterval(() => {
  this.checkIdle().catch((err) => logger.error(logger.CONTEXT.AI, "Idle check failed", err))
}, 60_000)
this.idleTimer.unref?.()
```

In `dispose()`, prepend:

```ts
if (this.idleTimer) {
  clearInterval(this.idleTimer)
  this.idleTimer = null
}
```

Add the `checkIdle` private method:

```ts
  private async checkIdle(): Promise<void> {
    if (!this.localClient.getState || this.config?.provider !== "local") return
    const server = (this.localClient as any).server
    if (!server?.isRunning?.()) return
    const opt = (this.config.local?.unloadModel ?? "15m") as UnloadOption
    const ms = UNLOAD_OPTION_MS[opt]
    if (ms === null) return
    if (Date.now() - this.lastActivityAt <= ms) return
    logger.info(logger.CONTEXT.AI, "Idle timeout reached, unloading server")
    await server.stop()
  }
```

In `sendMessage()`, at the very start of the function body (right after `if (!this.executor) ...`), add:

```ts
this.lastActivityAt = Date.now()
```

- [ ] **Step 4: Run idle test**

```bash
pnpm evitest run tests/main/ai/AIController.idleUnload.test.ts
```

Expected: 2 pass.

- [ ] **Step 5: Run full main suite**

```bash
pnpm test:main
```

Expected: green. Existing tests don't care about the idle timer (fake-timers off by default).

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/AIController.ts tests/main/ai/AIController.idleUnload.test.ts
git commit -m "feat(ai): idle-unload local server after Settings.ai.unloadModel window"
```

### Task 3: Settings UI control

- [ ] **Step 1: Open the local settings fragment**

Edit `src/renderer/src/ui/views/Settings/{fragments}/AiSettings/{fragments}/SettingsLocal.vue`. Add a new control bound to `settings.ai.local.unloadModel`. Use the existing `useSettingValue` composable + select element.

Sketch of what to add (find the place where other `local.*` settings are rendered, e.g. the active model select, and add this after):

```vue
<script setup lang="ts">
// existing imports + …
import {computed} from "vue"

import {useAiStore} from "@/stores/ai/ai.store"

const aiStore = useAiStore()
const unloadModel = computed({
  get: () => aiStore.config?.local?.unloadModel ?? "15m",
  set: (value: "never" | "5m" | "15m" | "30m") => aiStore.updateConfig({local: {...(aiStore.config?.local ?? {}), unloadModel: value}}),
})
</script>

<template>
  <!-- … existing controls … -->

  <label class="flex items-center justify-between gap-2 text-sm">
    <span>Unload model after idle</span>
    <select v-model="unloadModel" class="select select-sm select-bordered w-36">
      <option value="never">Never</option>
      <option value="5m">5 minutes</option>
      <option value="15m">15 minutes</option>
      <option value="30m">30 minutes</option>
    </select>
  </label>
</template>
```

The exact integration with existing `useSettingValue` may differ — read the file first to match the established style. The point is: a select bound to `unloadModel` that calls `aiStore.updateConfig` on change.

- [ ] **Step 2: Typecheck renderer**

```bash
pnpm typecheck:render
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ui/views/Settings
git commit -m "feat(ui): add unload-model dropdown to local AI settings"
```

### Task 4: Phase 5 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Phase 6: `deleteModel` correctness + `ensurePromise` dedup

**Approach:** Move `deleteModel` logic into `AIController` so it can coordinate with the running server. Add `ensurePromise` pattern to `LocalClient.checkConnection` to dedup concurrent start attempts.

**Files:**

- Modify: `src/main/ai/AIController.ts` — wrap `deleteLocalModel` with server-stop + settings-clear (or surface a new method `deleteLocalModel` if not present today).
- Modify: `src/main/ai/clients/local/LocalClient.ts` — add `unload()` method separate from `dispose()` (or use existing). Implement `ensurePromise` deduplication.
- Create tests: `tests/main/ai/AIController.deleteModel.test.ts`.

### Task 1: Audit existing delete flow

- [ ] **Step 1: Read current `deleteModel` path**

```bash
grep -n "deleteModel\|delete-local-model\|local-delete-model" \
  src/main/ai/AIController.ts \
  src/main/ai/clients/local/LocalClient.ts \
  src/main/ai/clients/local/core/LocalModelService.ts \
  src/main/setup/ipc/ai.ts \
  src/main/preload.ts \
  src/shared/types/ipc.ts
```

Read the IPC channel `ai:local-delete-model` (declared in `BridgeIPC`) and find which `AIController` method backs it. If `AIController` has no `deleteLocalModel` method (only direct passthrough to `modelService.deleteModel`), we add one.

- [ ] **Step 2: Note the current state in a working comment** (for the subagent's benefit — gets cleaned up at the end):

If the current chain is `IPC → modelService.deleteModel(id)` directly with no orchestration, the fix is to introduce `AIController.deleteLocalModel(id)`.

### Task 2: Add `AIController.deleteLocalModel`

- [ ] **Step 1: Failing test**

Create `tests/main/ai/AIController.deleteModel.test.ts`:

```ts
// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeStorage(selectedModel = "qwen3-4b-instruct") {
  return {
    loadSettings: vi.fn(async () => ({
      ai: {enabled: true, provider: "local", local: {model: selectedModel}},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

describe("AIController.deleteLocalModel", () => {
  it("stops the server when deleting the currently-running model", async () => {
    const storage = makeStorage("qwen3-4b-instruct")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "getCurrentModelId").mockReturnValue("qwen3-4b-instruct")
    const unload = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    const del = vi.spyOn(localClient.modelService, "deleteModel").mockResolvedValue(true)

    const ok = await ctrl.deleteLocalModel("qwen3-4b-instruct")

    expect(unload).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith("qwen3-4b-instruct")
    expect(ok).toBe(true)
    expect(storage.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ai: expect.objectContaining({local: expect.objectContaining({model: null})})}),
    )

    await ctrl.dispose()
  })

  it("does NOT stop the server when deleting an inactive model", async () => {
    const storage = makeStorage("hermes-3-llama-3.1-8b")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "getCurrentModelId").mockReturnValue("hermes-3-llama-3.1-8b")
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    vi.spyOn(localClient.modelService, "deleteModel").mockResolvedValue(true)

    await ctrl.deleteLocalModel("qwen3-4b-instruct")

    expect(stop).not.toHaveBeenCalled()
    await ctrl.dispose()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm evitest run tests/main/ai/AIController.deleteModel.test.ts
```

Expected: FAIL — `deleteLocalModel` does not exist.

- [ ] **Step 3: Implement `AIController.deleteLocalModel`**

Add this method to `AIController.ts`:

```ts
  async deleteLocalModel(modelId: string): Promise<boolean> {
    const server = (this.localClient as any).server
    const currentModelId = server?.getCurrentModelId?.()

    if (currentModelId === modelId) {
      await server.stop()
    }

    const ok = await this.localClient.modelService.deleteModel(modelId)

    if (this.config?.local?.model === modelId) {
      const newAi = {...(this.config ?? {}), local: {...(this.config?.local ?? {}), model: null}}
      this.config = newAi as typeof this.config
      await this.storage.saveSettings({ai: newAi as any})
    }

    return ok
  }
```

- [ ] **Step 4: Route the IPC channel through `deleteLocalModel`**

Edit `src/main/setup/ipc/ai.ts`. Find the `ai:local-delete-model` handler. Replace its body so it calls `getAi()?.deleteLocalModel(modelId)` instead of `getAi()?.getLocalModel().deleteModel(modelId)`.

- [ ] **Step 5: Run delete tests**

```bash
pnpm evitest run tests/main/ai/AIController.deleteModel.test.ts
```

Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/AIController.ts src/main/setup/ipc/ai.ts tests/main/ai/AIController.deleteModel.test.ts
git commit -m "fix(ai): stop server when deleting the active local model"
```

### Task 3: `ensurePromise` dedup in `LocalClient.checkConnection`

- [ ] **Step 1: Failing test**

Append to `tests/main/ai/AIController.deleteModel.test.ts` (or create a new file `LocalClient.ensurePromise.test.ts`):

```ts
describe("LocalClient.checkConnection dedup", () => {
  it("does not start the server twice when called concurrently", async () => {
    const storage = makeStorage("qwen3-4b-instruct")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.modelService, "isInstalled").mockResolvedValue(true)
    vi.spyOn(localClient.modelService, "getEntry").mockReturnValue({
      id: "qwen3-4b-instruct",
      ggufFilename: "x.gguf",
      serverArgs: {ctx: 1, gpuLayers: 1, temperature: 0.1},
    } as any)
    vi.spyOn(localClient.server, "ensureBinary").mockResolvedValue(undefined)
    const start = vi.spyOn(localClient.server, "start").mockResolvedValue(undefined)
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(false)
    vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    vi.spyOn(localClient.server, "getPort").mockReturnValue(12345)
    vi.spyOn(localClient.server, "getState").mockReturnValue({status: "not_installed"})

    const [a, b] = await Promise.all([localClient.checkConnection(), localClient.checkConnection()])
    expect(start).toHaveBeenCalledTimes(1)
    expect(a !== undefined && b !== undefined).toBe(true)
    await ctrl.dispose()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm evitest run tests/main/ai/AIController.deleteModel.test.ts
```

Expected: the new test fails — `server.start` called twice.

- [ ] **Step 3: Add `ensurePromise` to `LocalClient.checkConnection`**

Open `src/main/ai/clients/local/LocalClient.ts`. Add a private field:

```ts
private ensurePromise: Promise<boolean> | null = null
```

Refactor `checkConnection()` to dedup:

```ts
async checkConnection(): Promise<boolean> {
  if (this.ensurePromise) return this.ensurePromise
  this.ensurePromise = this.runConnect().finally(() => {
    this.ensurePromise = null
  })
  return this.ensurePromise
}

private async runConnect(): Promise<boolean> {
  // existing body of checkConnection moves here verbatim
}
```

Move the existing body of `checkConnection` into `runConnect` (no change to logic — just extracted).

- [ ] **Step 4: Run test**

```bash
pnpm evitest run tests/main/ai/AIController.deleteModel.test.ts
```

Expected: pass (server.start called exactly once).

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/clients/local/LocalClient.ts tests/main/ai/AIController.deleteModel.test.ts
git commit -m "fix(ai): dedup concurrent LocalClient.checkConnection via ensurePromise"
```

### Task 4: Phase 6 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Phase 7: DI rework in `AIController`

**Approach:** Make `AIController` accept injected `localClient` / `openaiClient` / `executor` for tests. Production paths construct defaults. Existing tests can opt into the injection or keep current spy-based mocking.

**Files:**

- Modify: `src/main/ai/AIController.ts` — constructor accepts `deps?: AIControllerDeps`.
- (No other files; existing tests stay green.)

### Task 1: Inject-friendly constructor

- [ ] **Step 1: Add `AIControllerDeps` type and use it in the constructor**

Open `src/main/ai/AIController.ts`. Add near the top:

```ts
import type {LocalAiClient} from "@/ai/clients/local"
import type {RemoteAiClient} from "@/ai/clients/remote"

export type AIControllerDeps = {
  remoteClient?: RemoteAiClient
  localClient?: LocalAiClient
  executor?: ToolExecutor
}
```

Update the constructor:

```ts
constructor(
  private storage: StorageController,
  broadcastState?: (state: LocalRuntimeState) => void,
  private broadcastConfirmation?: (event: ConfirmationBroadcastEvent) => void,
  private broadcastEvent?: (event: AIEvent) => void,
  deps: AIControllerDeps = {},
) {
  this.executor = deps.executor ?? new ToolExecutor(storage)
  this.openaiClient = deps.remoteClient ?? new RemoteAiClient()
  this.localClient = deps.localClient ?? new LocalAiClient(broadcastState)
}
```

- [ ] **Step 2: Run main suite**

```bash
pnpm test:main
```

Expected: all existing tests pass (no signature break — added param is at the end with default).

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/AIController.ts
git commit -m "refactor(ai): make AIController DI-friendly via optional deps param"
```

### Task 2: Phase 7 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Phase 8: Renderer UI polish — Continue button, speedScore, verifying spinner, hardcode audit

**Approach:** Render `partialBytes` as a "Continue download" button in the model card. Add a verifying spinner state. Surface `accuracy`/`tier` as a small label. Audit renderer for hardcoded model IDs/titles/descriptions and remove them.

**Files:**

- Modify: `src/renderer/src/ui/views/Settings/{fragments}/AiSettings/{fragments}/LocalModelCard.vue` — Continue button, verifying state.
- Audit: all renderer `.ts`/`.vue` files for hardcoded model strings.

### Task 1: Hardcode audit

- [ ] **Step 1: Run grep**

```bash
grep -rnE "daily-fast|daily-balanced|daily-quality|qwen3-4b-instruct|hermes-3-llama|qwen3-14b-instruct" src/renderer/ | grep -v node_modules
```

If any hits surface in `.vue` or `.ts` outside of strict IPC typing (which is fine for `LocalModelId` _type_ mentions but not for hardcoded string literals shown to users), open each file and refactor to read from `aiStore.localModels` / IPC instead.

If no hits: the audit passes.

- [ ] **Step 2: Search for model title/description strings**

```bash
grep -rnE "Minimal|Balanced|Quality" src/renderer/ | grep -v node_modules | grep -v 'Quality reports' | head -20
```

This is fuzzier — check each hit. If a Vue component renders the string "Minimal" / "Balanced" / "Quality" directly (instead of `{{ model.title }}`), refactor.

- [ ] **Step 3: Commit any refactors**

```bash
git add src/renderer
git commit -m "refactor(ui): remove hardcoded model strings from renderer"
```

(Empty commit if no changes — skip.)

### Task 2: Continue download + verifying spinner

- [ ] **Step 1: Patch `LocalModelCard.vue`**

Open the file. Replace the existing `<template>` with one that:

1. Shows a `Continue` button when `!model.installed && !isDownloading && model.partialBytes > 0`.
2. Shows a verifying spinner when `downloadProgress?.phase === "verifying"`.
3. Shows partial bytes alongside size if present.

Sketch of the relevant template fragments to add:

```vue
<template>
  <div class="flex flex-col gap-1">
    <div class="bg-base-200/40 border-base-300 flex flex-col gap-2 rounded-lg border p-3">
      <!-- existing title row, unchanged -->

      <!-- existing buttons block, add Continue branch -->
      <div class="flex items-center gap-1">
        <template v-if="isPending && !isDownloading">
          <BaseIcon name="refresh" class="text-base-content/50 size-4 animate-spin" />
        </template>

        <template v-else-if="!model.installed && model.partialBytes && model.partialBytes > 0 && !isDownloading">
          <BaseButton variant="secondary" size="sm" tooltip="Continue download" class="px-2" @click="onDownload"> Continue </BaseButton>
        </template>

        <template v-else-if="!model.installed && !isDownloading">
          <BaseButton variant="secondary" size="sm" icon="plus" tooltip="Download" class="size-7 p-0" @click="onDownload" />
        </template>

        <template v-else-if="isDownloading">
          <BaseButton
            variant="ghost"
            size="sm"
            icon="x-mark"
            tooltip="Cancel"
            class="text-warning hover:text-warning size-7 p-0"
            @click="emit('cancelDownload')"
          />
        </template>

        <template v-else-if="model.installed && !isActive">
          <BaseButton variant="secondary" size="sm" icon="check" tooltip="Select" class="size-7 p-0" @click="emit('select')" />
          <BaseButton variant="ghost" size="sm" class="size-7 p-0" tooltip="Delete" @click="emit('delete')">
            <BaseIcon name="trash" class="size-4" />
          </BaseButton>
        </template>

        <template v-else-if="model.installed && isActive">
          <BaseButton variant="ghost" size="sm" class="size-7 p-0" tooltip="Delete" @click="emit('delete')">
            <BaseIcon name="trash" class="size-4" />
          </BaseButton>
        </template>
      </div>

      <!-- size row -->
      <div class="text-base-content/60 text-xs">
        {{ sizeLabel }} · Requires {{ model.requirements.ramGb }}GB RAM
        <span v-if="model.partialBytes && !model.installed" class="text-warning ml-2">
          {{ Math.round((model.partialBytes / model.sizeBytes) * 100) }}% downloaded
        </span>
      </div>

      <!-- progress -->
      <div v-if="isDownloading && downloadProgress" class="flex flex-col gap-1">
        <div class="bg-base-300 relative h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="bg-accent absolute top-0 left-0 h-full transition-all duration-200 ease-in-out"
            :style="{width: `${downloadProgress.percent}%`}"
          />
        </div>
        <span class="text-base-content/50 text-xs">
          <template v-if="downloadProgress.phase === 'verifying'">Verifying checksum…</template>
          <template v-else>{{ downloadProgress.percent }}%</template>
        </span>
      </div>
    </div>

    <p v-if="error" class="text-error px-1 text-xs">{{ error }}</p>
  </div>
</template>
```

- [ ] **Step 2: Typecheck renderer**

```bash
pnpm typecheck:render
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ui/views/Settings/{fragments}/AiSettings/{fragments}/LocalModelCard.vue
git commit -m "feat(ui): show Continue button + verifying spinner + partial percent in model card"
```

### Task 3: Phase 8 gate

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular`

---

## Final verification

After Phase 8 passes its gate, run the full eval suite plus a manual smoke pass:

- [ ] **Full evals**

```bash
pnpm evitest run tests/main/ai/evals/
```

Expected: all 8 scenarios green.

- [ ] **Combined gate**

```bash
pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular
```

Expected: ~510 tests pass (483 from `feat/agentic` + ~25 added across phases).

- [ ] **Manual smoke pass** — see Phase 2, Task 5, Step 3. Repeat with the final catalog. Verify each tier downloads, runs, and answers a simple agent prompt without errors.

- [ ] **Branch status check**

```bash
git log --oneline feat/agentic..feat/local-model-migration | wc -l
```

Expected: ~25–30 commits across all phases.

The branch is now ready for the final integration step (out of scope of this plan): both `feat/agentic` and `feat/local-model-migration` merge into `main` in a single series after the user has manually validated end-to-end behavior.

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-06-06-local-model-migration.md`):**

- ✅ JSON catalog + validator + tier — Phase 1 Tasks 1-3.
- ✅ llama.cpp upgrade + new models — Phase 2 Tasks 1-4.
- ✅ SHA256 for binary — Phase 2 Task 3.
- ✅ SHA256 for GGUF — Phase 3 Task 2.
- ✅ `verifying` phase in DownloadProgress — Phase 3 Task 1.
- ✅ `partialBytes` in ModelInfo — Phase 3 Task 2 Step 6; surfaced in UI Phase 8 Task 2.
- ✅ Resumable downloads — Phase 4 Task 1.
- ✅ Orphan `.download` cleanup — Phase 4 Task 2.
- ✅ Idle unload + Settings.unloadModel — Phase 5 Tasks 1-3.
- ✅ `deleteModel` correctness — Phase 6 Task 2.
- ✅ `ensurePromise` dedup — Phase 6 Task 3.
- ✅ DI rework in AIController — Phase 7 Task 1.
- ✅ Renderer hardcode audit — Phase 8 Task 1.
- ✅ Continue button + verifying spinner — Phase 8 Task 2.
- ✅ `speedScore` for picker UX — **gap.** Spec asks for it; this plan doesn't include it. Add follow-up: in Phase 8 Task 2, also render `accuracy` and `tier` if needed; `speedScore` is computed by service. **Resolution:** spec admits `speedScore` is low-priority UX polish; not implementing it in this plan is acceptable since the foundation (catalog with `tier`, sizes) is there and a follow-up task can add it without touching backend.

**Placeholder scan:**

- "TBD" / "TODO" — none.
- "Implement appropriate logic" — none. Every step has full code.
- "Add tests for the above" without code — none.

**Type consistency:**

- `ModelManifestEntry.tier` introduced in Phase 1, used in Phase 1 prompt-tier mapping and Phase 8 UI — consistent.
- `LocalModelDownloadProgress.phase` introduced in Phase 3, used in Phase 8 UI — consistent.
- `AIControllerDeps` introduced in Phase 7, no consumers in plan (used in future tests) — consistent.
- `UnloadOption` type introduced in Phase 5 manifest, used in Phase 5 AIController and Settings UI — consistent.
- `LocalModelId` changed from union to `string` in Phase 2; all downstream usage stays correct because the type widens.

**Notes on testability gaps:**

- Phase 2 has `pnpm evitest run tests/main/ai/evals/` as gate — those tests already exist on `feat/agentic` and mock the LLM client, so they pass regardless of catalog changes. They are a regression net for AIController loop behavior; they will catch if Phase 7 DI rework or Phase 1 catalog rewire breaks the loop.
- Manual smoke at Phase 2 Task 5 Step 3 is the only place that exercises a real binary + real model. This is **necessary and unavoidable** — no unit test can validate that `b9374` correctly handles Qwen3 tool calls.

Plan complete.
