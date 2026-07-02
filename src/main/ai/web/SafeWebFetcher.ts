import {fetch as undiciFetch} from "undici"

import {WebFetchError} from "@shared/errors/web/WebFetchError"
import {WebFetchErrorCode} from "@shared/errors/web/WebFetchErrorCode"

import {assertUrlAllowed} from "./utils/assertUrlAllowed"
import {createPinnedAgent} from "./utils/createPinnedAgent"
import {ALLOWED_CONTENT_TYPES, WEB_LIMITS} from "./constants"

import type {Agent} from "undici"
import type {LookupFn, SafeFetchResult} from "./types"

type WebResponse = {
  status: number
  headers: {get(name: string): string | null}
  body: ReadableStream<Uint8Array> | null
}
type FetchInit = {method: string; redirect: "manual"; signal: AbortSignal; headers: Record<string, string>; dispatcher?: unknown}
type FetchFn = (url: string, init: FetchInit) => Promise<WebResponse>
type SafeWebFetcherDeps = {fetch?: FetchFn; lookup?: LookupFn}

/**
 * Fetches a single URL with SSRF protection, manual redirect re-validation, a
 * size cap, a timeout, and a content-type allowlist. The production path pins
 * each connection to the exact validated IP (undici dispatcher) to defeat DNS
 * rebinding. Throws WebFetchError.
 */
export class SafeWebFetcher {
  private readonly fetchFn: FetchFn
  private readonly lookup?: LookupFn
  private readonly dispatcher?: Agent

  constructor(deps: SafeWebFetcherDeps = {}) {
    this.fetchFn = deps.fetch ?? (undiciFetch as unknown as FetchFn)
    this.lookup = deps.lookup
    this.dispatcher = deps.fetch ? undefined : createPinnedAgent()
  }

  async fetch(rawUrl: string): Promise<SafeFetchResult> {
    let current = rawUrl
    const signal = AbortSignal.timeout(WEB_LIMITS.timeoutMs)

    for (let hop = 0; hop <= WEB_LIMITS.maxRedirects; hop++) {
      const url = await assertUrlAllowed(current, {lookup: this.lookup})
      const response = await this.request(url, signal)

      if (isRedirect(response.status)) {
        const location = response.headers.get("location")
        if (!location) throw new WebFetchError(WebFetchErrorCode.FetchFailed, "Redirect without Location")
        current = new URL(location, url).toString()
        continue
      }

      const contentType = response.headers.get("content-type") ?? ""
      if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
        throw new WebFetchError(WebFetchErrorCode.DisallowedContentType, `Disallowed content-type: ${contentType || "(none)"}`)
      }

      const body = await drainCapped(response, WEB_LIMITS.maxBytes)
      return {finalUrl: url.toString(), contentType, body}
    }

    throw new WebFetchError(WebFetchErrorCode.TooManyRedirects, `Exceeded ${WEB_LIMITS.maxRedirects} redirects`)
  }

  private async request(url: URL, signal: AbortSignal): Promise<WebResponse> {
    try {
      return await this.fetchFn(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"},
        dispatcher: this.dispatcher,
      })
    } catch (err) {
      const cause = err instanceof Error ? (err as {cause?: unknown}).cause : null
      if (err instanceof WebFetchError) throw err
      if (cause instanceof WebFetchError) throw cause
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new WebFetchError(WebFetchErrorCode.Timeout, `Request timed out after ${WEB_LIMITS.timeoutMs}ms`)
      }
      throw new WebFetchError(WebFetchErrorCode.FetchFailed, err instanceof Error ? err.message : "fetch failed")
    }
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function drainCapped(response: WebResponse, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let total = 0
  let text = ""
  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new WebFetchError(WebFetchErrorCode.ResponseTooLarge, `Response exceeded ${maxBytes} bytes`)
    }
    text += decoder.decode(value, {stream: true})
  }
  return text + decoder.decode()
}
