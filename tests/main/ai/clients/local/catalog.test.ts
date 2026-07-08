// @ts-nocheck
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {loadCatalog, parseCatalog} from "@main/ai/clients/local/core/catalog"

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

describe("parseCatalog", () => {
  const validEntry = {
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
    accuracy: null,
  }

  it("parses a well-formed catalog string", () => {
    const out = parseCatalog(JSON.stringify({schemaVersion: 1, models: [validEntry]}))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("x")
  })

  it("returns [] on malformed JSON", () => {
    expect(parseCatalog("not-json{")).toEqual([])
  })

  it("returns [] on unsupported schemaVersion", () => {
    expect(parseCatalog(JSON.stringify({schemaVersion: 99, models: [validEntry]}))).toEqual([])
  })

  it("accepts serverArgs.launchArgs as a string array", () => {
    const entry = {...validEntry, serverArgs: {...validEntry.serverArgs, launchArgs: ["--rope-scaling", "yarn"]}}
    const out = parseCatalog(JSON.stringify({schemaVersion: 1, models: [entry]}))
    expect(out[0].serverArgs.launchArgs).toEqual(["--rope-scaling", "yarn"])
  })

  it("rejects an entry whose launchArgs is not a string array", () => {
    const entry = {...validEntry, serverArgs: {...validEntry.serverArgs, launchArgs: [1, 2]}}
    const out = parseCatalog(JSON.stringify({schemaVersion: 1, models: [entry]}))
    expect(out).toEqual([])
  })
})
