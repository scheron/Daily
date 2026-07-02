import {lookup as nodeLookup} from "node:dns/promises"

import {WebFetchError} from "@shared/errors/web/WebFetchError"
import {WebFetchErrorCode} from "@shared/errors/web/WebFetchErrorCode"
import {stripBrackets} from "@shared/utils/common/stripBrackets"
import {isBlockedAddress} from "@shared/utils/web/isBlockedAddress"
import {normalizeIpLiteral} from "@shared/utils/web/normalizeIpLiteral"

import type {LookupFn, LookupResult} from "../types"

export type SsrfGuardDeps = {lookup?: LookupFn}

/**
 * Validates a URL is safe to fetch: http(s) only, no credentials, and every
 * resolved IP is a public address. Throws WebFetchError otherwise. Returns the
 * parsed URL on success.
 *
 * @example await assertUrlAllowed("https://example.com")
 */
export async function assertUrlAllowed(rawUrl: string, deps: SsrfGuardDeps = {}): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new WebFetchError(WebFetchErrorCode.DisallowedScheme, `Invalid URL: ${rawUrl}`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebFetchError(WebFetchErrorCode.DisallowedScheme, `Only http/https allowed, got ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, "URLs with embedded credentials are not allowed")
  }

  const host = stripBrackets(url.hostname)
  const literal = normalizeIpLiteral(host)
  const addresses = literal ? [literal] : (await resolve(host, deps.lookup)).map((r) => r.address)

  if (addresses.length === 0) {
    throw new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, `Could not resolve host: ${host}`)
  }
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, `Blocked address ${address} for host ${host}`)
    }
  }
  return url
}

async function resolve(host: string, lookup?: LookupFn): Promise<LookupResult[]> {
  const fn: LookupFn = lookup ?? ((h) => nodeLookup(h, {all: true, verbatim: true}))
  try {
    return await fn(host)
  } catch {
    throw new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, `DNS lookup failed for ${host}`)
  }
}
