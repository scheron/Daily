import {randomInt} from "node:crypto"

import {SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

/**
 * Generates a numeric code of `SYNC_PROTOCOL_CONFIG.codeLength` digits from a cryptographic
 * source, zero-padded so a leading zero survives. Both doors a device is bound through — the
 * claim code and the enrollment code — mint their digits here.
 */
export function generateCode(): string {
  const digits = randomInt(0, 10 ** SYNC_PROTOCOL_CONFIG.codeLength)

  return String(digits).padStart(SYNC_PROTOCOL_CONFIG.codeLength, "0")
}
