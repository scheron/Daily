import {mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {fetchRemoteCatalog, readCachedCatalog, writeCachedCatalog} from "@main/ai/clients/local/core/remoteCatalog"

describe("remoteCatalog", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "remote-catalog-"))
  })
  afterEach(() => {
    rmSync(dir, {recursive: true, force: true})
    vi.restoreAllMocks()
  })

  it("fetchRemoteCatalog returns the body on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ok: true, status: 200, text: async () => "BODY"})),
    )
    await expect(fetchRemoteCatalog("https://x/models.json", {timeoutMs: 1000})).resolves.toBe("BODY")
  })

  it("fetchRemoteCatalog throws on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ok: false, status: 404, text: async () => ""})),
    )
    await expect(fetchRemoteCatalog("https://x/models.json", {timeoutMs: 1000})).rejects.toThrow()
  })

  it("fetchRemoteCatalog rejects when the timeout aborts a hanging request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts: {signal: AbortSignal}) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
          }),
      ),
    )
    await expect(fetchRemoteCatalog("https://x/models.json", {timeoutMs: 5})).rejects.toThrow()
  })

  it("readCachedCatalog returns null when the file is missing", async () => {
    await expect(readCachedCatalog(join(dir, "nope.json"))).resolves.toBeNull()
  })

  it("writeCachedCatalog then readCachedCatalog round-trips", async () => {
    const path = join(dir, "nested", "catalog.json")
    await writeCachedCatalog(path, "DATA")
    expect(readFileSync(path, "utf8")).toBe("DATA")
    await expect(readCachedCatalog(path)).resolves.toBe("DATA")
  })
})
