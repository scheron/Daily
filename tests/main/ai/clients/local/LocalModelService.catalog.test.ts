import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {LocalModelService} from "@main/ai/clients/local/core/LocalModelService"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function catalogJson(id: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    models: [
      {
        id,
        title: id,
        description: id,
        tier: "fast",
        sizeBytes: 1000,
        requirements: {ramGb: 1, diskGb: 1},
        ggufUrl: `https://example/${id}.gguf`,
        ggufFilename: `${id}.gguf`,
        sha256: null,
        serverArgs: {ctx: 1024, gpuLayers: 99, temperature: 0.1},
        accuracy: null,
      },
    ],
  })
}

describe("LocalModelService catalog", () => {
  let dir: string
  let source: {url: string; cachePath: string; bundledPath: string}

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lms-catalog-"))
    source = {url: "https://x/models.json", cachePath: join(dir, "cache.json"), bundledPath: join(dir, "bundled.json")}
    writeFileSync(source.bundledPath, catalogJson("bundled"))
  })
  afterEach(() => {
    rmSync(dir, {recursive: true, force: true})
    vi.restoreAllMocks()
  })

  it("init prefers the cache over the bundled catalog", async () => {
    writeFileSync(source.cachePath, catalogJson("cached"))
    const svc = new LocalModelService(join(dir, "models"), undefined, source)
    await svc.init()
    expect(svc.getCatalog().map((m) => m.id)).toEqual(["cached"])
  })

  it("init falls back to bundled when no cache exists", async () => {
    const svc = new LocalModelService(join(dir, "models"), undefined, source)
    await svc.init()
    expect(svc.getCatalog().map((m) => m.id)).toEqual(["bundled"])
  })

  it("refreshCatalog replaces the in-memory catalog and writes the cache on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ok: true, status: 200, text: async () => catalogJson("remote")})),
    )
    const svc = new LocalModelService(join(dir, "models"), undefined, source)
    await svc.init()
    const result = await svc.refreshCatalog()
    expect(result).toBe("updated")
    expect(svc.getCatalog().map((m) => m.id)).toEqual(["remote"])
    const {readCachedCatalog} = await import("@main/ai/clients/local/core/remoteCatalog")
    expect(await readCachedCatalog(source.cachePath)).toBe(catalogJson("remote"))
  })

  it("refreshCatalog keeps the current catalog and returns 'failed' on fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ok: false, status: 500, text: async () => ""})),
    )
    const svc = new LocalModelService(join(dir, "models"), undefined, source)
    await svc.init()
    const result = await svc.refreshCatalog()
    expect(result).toBe("failed")
    expect(svc.getCatalog().map((m) => m.id)).toEqual(["bundled"])
  })

  it("refreshCatalog keeps the current catalog when the remote schemaVersion is unsupported", async () => {
    const newer = JSON.stringify({schemaVersion: 99, models: []})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ok: true, status: 200, text: async () => newer})),
    )
    const svc = new LocalModelService(join(dir, "models"), undefined, source)
    await svc.init()
    const result = await svc.refreshCatalog()
    expect(result).toBe("failed")
    expect(svc.getCatalog().map((m) => m.id)).toEqual(["bundled"])
  })
})

describe("LocalModelService orphans", () => {
  let dir: string
  let modelsDir: string
  let source: {url: string; cachePath: string; bundledPath: string}

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lms-orphan-"))
    modelsDir = join(dir, "models")
    mkdirSync(modelsDir, {recursive: true})
    source = {url: "https://x/models.json", cachePath: join(dir, "cache.json"), bundledPath: join(dir, "bundled.json")}
    writeFileSync(source.bundledPath, catalogJson("known"))
  })
  afterEach(() => rmSync(dir, {recursive: true, force: true}))

  it("keeps an installed .gguf that is absent from the catalog and surfaces it as orphaned", async () => {
    writeFileSync(join(modelsDir, "known.gguf"), "x")
    writeFileSync(join(modelsDir, "ghost.gguf"), "y")
    const svc = new LocalModelService(modelsDir, undefined, source)
    await svc.init()
    expect(existsSync(join(modelsDir, "ghost.gguf"))).toBe(true)
    const models = await svc.listModels()
    const ghost = models.find((m) => m.id === "ghost.gguf")
    expect(ghost?.orphaned).toBe(true)
    expect(ghost?.installed).toBe(true)
  })

  it("still deletes an orphaned .download partial", async () => {
    writeFileSync(join(modelsDir, "ghost.gguf.download"), "y")
    const svc = new LocalModelService(modelsDir, undefined, source)
    await svc.init()
    expect(existsSync(join(modelsDir, "ghost.gguf.download"))).toBe(false)
  })

  it("deleteModel removes an orphaned file by filename", async () => {
    writeFileSync(join(modelsDir, "ghost.gguf"), "y")
    const svc = new LocalModelService(modelsDir, undefined, source)
    await svc.init()
    expect(await svc.deleteModel("ghost.gguf")).toBe(true)
    expect(existsSync(join(modelsDir, "ghost.gguf"))).toBe(false)
  })

  it("deleteModel refuses a filename outside the models dir", async () => {
    const svc = new LocalModelService(modelsDir, undefined, source)
    await svc.init()
    expect(await svc.deleteModel("../escape.gguf")).toBe(false)
  })
})
