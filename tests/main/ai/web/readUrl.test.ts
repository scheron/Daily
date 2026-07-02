// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {LRU} from "@shared/utils/common/LRU"

import {readUrl} from "@main/ai/tools/registry/categories/web/readUrl"

const MARKER = "REGISTER_ENDPOINT"
const bigText = "A".repeat(20000) + MARKER + "B".repeat(20000)

function plainFetcher() {
  return {fetch: vi.fn(async () => ({finalUrl: "https://example.com/spec", contentType: "text/plain", body: bigText}))}
}

function ctx(fetcher, cache) {
  return {
    storage: {},
    now: () => new Date(),
    caller: "in-app",
    __fetcher: fetcher,
    pageCache: cache ?? new LRU(4, 60_000),
  }
}

describe("read_url tool", () => {
  it("is always available, marked external-egress and non-destructive", () => {
    expect(readUrl.name).toBe("read_url")
    expect(readUrl.isExternalEgress).toBe(true)
    expect(readUrl.isDestructive).toBe(false)
    expect(readUrl.isWrite).toBe(false)
  })

  it("willEgress is true for an uncached url and false once cached", () => {
    const cache = new LRU(4, 60_000)
    expect(readUrl.willEgress({url: "https://uncached.example/"}, cache)).toBe(true)
    cache.set("https://cached3.example/", {finalUrl: "https://cached3.example/", title: null, text: "x", served: 0})
    expect(readUrl.willEgress({url: "https://cached3.example/"}, cache)).toBe(false)
  })

  it("returns the first window with a metadata header and framed content", async () => {
    const r = await readUrl.execute({url: "https://example.com/spec"}, ctx(plainFetcher()))
    expect(r.success).toBe(true)
    expect(r.data).toContain("[read_url]")
    expect(r.data).toContain("chars 0–16000 of 40017")
    expect(r.data).toContain("offset=16000")
    expect(r.data).toContain("UNTRUSTED WEB CONTENT")
    expect(r.summary).toMatch(/example\.com/)
  })

  it("serves a later window from cache without re-fetching", async () => {
    const fetcher = plainFetcher()
    const cache = new LRU(4, 60_000)
    await readUrl.execute({url: "https://example.com/spec"}, ctx(fetcher, cache))
    const r2 = await readUrl.execute({url: "https://example.com/spec", offset: 16000}, ctx(fetcher, cache))
    expect(fetcher.fetch).toHaveBeenCalledTimes(1)
    expect(r2.success).toBe(true)
    expect(r2.data).toContain("chars 16000–32000 of 40017")
    expect(r2.data).toContain(MARKER) // marker sits at index 20000
  })

  it("jumps to a find match in a large page", async () => {
    const r = await readUrl.execute({url: "https://example.com/spec", find: "register_endpoint"}, ctx(plainFetcher()))
    expect(r.success).toBe(true)
    expect(r.data).toContain("chars 20000–36000 of 40017")
    expect(r.data).toContain(MARKER)
  })

  it("reports a missing find without erroring", async () => {
    const r = await readUrl.execute({url: "https://example.com/spec", find: "nonexistent-xyz"}, ctx(plainFetcher()))
    expect(r.success).toBe(true)
    expect(r.data).toMatch(/not found/i)
  })

  it("stops serving once the per-page read budget is reached", async () => {
    const body = "Z".repeat(70000)
    const fetcher = {fetch: vi.fn(async () => ({finalUrl: "https://example.com/huge", contentType: "text/plain", body}))}
    const cache = new LRU(4, 60_000)
    await readUrl.execute({url: "https://example.com/huge"}, ctx(fetcher, cache)) // 0–16k
    await readUrl.execute({url: "https://example.com/huge", offset: 16000}, ctx(fetcher, cache)) // 16–32k
    await readUrl.execute({url: "https://example.com/huge", offset: 32000}, ctx(fetcher, cache)) // 32–48k (budget = 48k)
    const r = await readUrl.execute({url: "https://example.com/huge", offset: 48000}, ctx(fetcher, cache))
    expect(fetcher.fetch).toHaveBeenCalledTimes(1)
    expect(r.success).toBe(true)
    expect(r.data).toMatch(/budget/i)
  })

  it("honors an injected (model-scaled) read budget for window size and stop", async () => {
    const body = "Z".repeat(70000)
    const fetcher = {fetch: vi.fn(async () => ({finalUrl: "https://example.com/sm", contentType: "text/plain", body}))}
    const cache = new LRU(4, 60_000)
    const webRead = {windowChars: 5000, maxServedChars: 10000}
    const c = () => ({...ctx(fetcher, cache), webRead})

    const r1 = await readUrl.execute({url: "https://example.com/sm"}, c())
    expect(r1.data).toContain("chars 0–5000 of 70000") // window scaled to 5000
    await readUrl.execute({url: "https://example.com/sm", offset: 5000}, c()) // served 10000 = budget
    const r3 = await readUrl.execute({url: "https://example.com/sm", offset: 10000}, c())
    expect(r3.data).toMatch(/budget/i)
  })

  it("reports an empty client-rendered shell honestly", async () => {
    const fetcher = {fetch: async () => ({finalUrl: "https://app.example/", contentType: "text/html", body: `<div id="root"></div>`})}
    const r = await readUrl.execute({url: "https://app.example/"}, ctx(fetcher))
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/client|render/i)
  })
})
