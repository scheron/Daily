import {createHash, randomBytes} from "node:crypto"

import {SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

/** Mints a fresh device credential: cryptographically random bytes, base64url-encoded. */
export function mintToken(): string {
  return randomBytes(SYNC_PROTOCOL_CONFIG.tokenBytes).toString("base64url")
}

/** Hashes a device credential for storage and lookup; the plaintext token is never persisted. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
