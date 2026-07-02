import {lookup as nodeLookup} from "node:dns"
import {Agent} from "undici"

import {WebFetchError} from "@shared/errors/web/WebFetchError"
import {WebFetchErrorCode} from "@shared/errors/web/WebFetchErrorCode"
import {isBlockedAddress} from "@shared/utils/web/isBlockedAddress"

type Address = {address: string; family: number}
type LookupCallback = (err: Error | null, addressOrList?: string | Address[], family?: number) => void
type AllResolver = (hostname: string, options: {all: true; verbatim: true}, callback: (err: Error | null, addresses: Address[]) => void) => void

/**
 * Builds an undici Agent whose connections only reach validated public
 * addresses. The connect-time DNS lookup blocks any private/loopback result,
 * so the IPs that are validated are exactly the IPs connected to — closing the
 * DNS-rebinding (TOCTOU) window.
 */
export function createPinnedAgent(): Agent {
  return new Agent({connect: {lookup: createValidatingLookup() as never}})
}

// undici invokes this with `options.all === true` and expects the array form
// `(null, [{address, family}])`; the single form is kept as a fallback. All
// resolved addresses are validated, so whichever undici picks is safe.
function createValidatingLookup(resolver: AllResolver = nodeLookup as unknown as AllResolver) {
  return (hostname: string, options: {all?: boolean} | undefined, callback: LookupCallback): void => {
    resolver(hostname, {all: true, verbatim: true}, (err, addresses) => {
      if (err) return callback(err)
      const list = Array.isArray(addresses) ? addresses : []
      if (list.length === 0) {
        return callback(new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, `Could not resolve ${hostname}`))
      }
      for (const a of list) {
        if (isBlockedAddress(a.address)) {
          return callback(new WebFetchError(WebFetchErrorCode.BlockedBySsrfGuard, `Blocked address ${a.address} for ${hostname}`))
        }
      }
      if (options?.all) return callback(null, list)
      callback(null, list[0].address, list[0].family)
    })
  }
}
