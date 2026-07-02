// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {WebFetchError} from "@shared/errors/web/WebFetchError"
import {WebFetchErrorCode} from "@shared/errors/web/WebFetchErrorCode"

import {SafeWebFetcher} from "@main/ai/web/SafeWebFetcher"

const publicLookup = async () => [{address: "93.184.216.34", family: 4}]

function res({status = 200, headers = {}, body = ""}) {
  const h = new Headers(headers)
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(body))
      c.close()
    },
  })
  return {
    status,
    headers: h,
    body: stream,
    async text() {
      return body
    },
  }
}

describe("SafeWebFetcher", () => {
  it("returns body + final url for a public 200 html page", async () => {
    const fetchFn = vi.fn(async () => res({headers: {"content-type": "text/html"}, body: "<h1>hi</h1>"}))
    const f = new SafeWebFetcher({fetch: fetchFn, lookup: publicLookup})
    const out = await f.fetch("https://example.com/p")
    expect(out.body).toContain("hi")
    expect(out.finalUrl).toBe("https://example.com/p")
    expect(out.contentType).toContain("text/html")
  })

  it("rejects a disallowed content-type before downloading", async () => {
    const fetchFn = vi.fn(async () => res({headers: {"content-type": "application/pdf"}, body: "%PDF"}))
    const f = new SafeWebFetcher({fetch: fetchFn, lookup: publicLookup})
    await expect(f.fetch("https://example.com/x.pdf")).rejects.toMatchObject({code: WebFetchErrorCode.DisallowedContentType})
  })

  it("re-validates redirects and blocks a hop to a private IP", async () => {
    const lookup = async (h) => (h === "evil.example" ? [{address: "169.254.169.254", family: 4}] : [{address: "93.184.216.34", family: 4}])
    const fetchFn = vi.fn(async () => res({status: 302, headers: {location: "http://evil.example/meta"}}))
    const f = new SafeWebFetcher({fetch: fetchFn, lookup})
    await expect(f.fetch("https://good.example/")).rejects.toMatchObject({code: WebFetchErrorCode.BlockedBySsrfGuard})
  })

  it("aborts when the body exceeds maxBytes", async () => {
    const big = "a".repeat(3 * 1024 * 1024)
    const fetchFn = vi.fn(async () => res({headers: {"content-type": "text/plain"}, body: big}))
    const f = new SafeWebFetcher({fetch: fetchFn, lookup: publicLookup})
    await expect(f.fetch("https://example.com/big")).rejects.toMatchObject({code: WebFetchErrorCode.ResponseTooLarge})
  })

  it("stops after maxRedirects", async () => {
    const fetchFn = vi.fn(async () => res({status: 302, headers: {location: "https://example.com/next"}}))
    const f = new SafeWebFetcher({fetch: fetchFn, lookup: publicLookup})
    await expect(f.fetch("https://example.com/start")).rejects.toMatchObject({code: WebFetchErrorCode.TooManyRedirects})
  })
})
