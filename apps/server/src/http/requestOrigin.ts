import {isIP} from "node:net"

import type {RequestOrigin} from "@daily/protocol"
import type {IncomingMessage} from "node:http"

/**
 * Where a request reached this server from: the immediate peer, or the address a forwarding
 * header names when — and only when — that peer is itself private. `null` when the connection
 * carries no peer address at all.
 */
export function readRequestOrigin(req: IncomingMessage): RequestOrigin | null {
  const peer = normaliseAddress(req.socket.remoteAddress ?? null)
  if (peer === null) return null
  if (!isPrivateAddress(peer)) return {address: peer, isPrivate: false}

  const forwarded = readForwardedAddress(req)
  const address = forwarded ?? peer

  return {address, isPrivate: isPrivateAddress(address)}
}

/**
 * True when `address` sits on a range a forwarding header may be trusted from: loopback, the
 * three private IPv4 blocks (`10/8`, `172.16/12`, `192.168/16`), IPv4 link-local (`169.254/16`),
 * and their IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`). This answers a narrower question
 * than an SSRF blocklist and does not reject multicast or other reserved space. Exported so a
 * route can classify an address read back from storage, where `readRequestOrigin` itself — which
 * needs a live request — cannot be called again.
 *
 * @example isPrivateAddress("192.168.1.10") // true
 * @example isPrivateAddress("203.0.113.9") // false
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPrivateV4(address)
  if (version === 6) return isPrivateV6(address)

  return false
}

function readForwardedAddress(req: IncomingMessage): string | null {
  const header = req.headers["x-forwarded-for"]
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value !== "string") return null

  const candidate = normaliseAddress(value.split(",")[0]?.trim() ?? null)

  return candidate !== null && isIP(candidate) !== 0 ? candidate : null
}

/** Normalises an IPv4-mapped `::ffff:` address — dotted or hex-grouped — to its dotted IPv4 form; anything else passes through unchanged. */
function normaliseAddress(address: string | null): string | null {
  if (!address || address.trim().length === 0) return null

  const trimmed = address.trim()

  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)
  if (dotted) return dotted[1]

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(trimmed)
  if (hex) return hexPairToDotted(hex[1], hex[2])

  return trimmed
}

function hexPairToDotted(hi: string, lo: string): string {
  const h = parseInt(hi, 16)
  const l = parseInt(lo, 16)

  return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`
}

function isPrivateV4(address: string): boolean {
  const octets = address.split(".").map(Number)
  const [a, b] = octets
  const isLoopback = a === 127
  const isTenBlock = a === 10
  const isSeventeenTwoBlock = a === 172 && b >= 16 && b <= 31
  const isOneNineTwoBlock = a === 192 && b === 168
  const isLinkLocal = a === 169 && b === 254

  return isLoopback || isTenBlock || isSeventeenTwoBlock || isOneNineTwoBlock || isLinkLocal
}

function isPrivateV6(address: string): boolean {
  const a = address.toLowerCase()
  const isLoopback = a === "::1"
  const isUniqueLocal = a.startsWith("fc") || a.startsWith("fd")
  const isLinkLocal = /^fe[89ab]/.test(a)
  if (isLoopback || isUniqueLocal || isLinkLocal) return true

  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  if (dotted) return isPrivateV4(dotted[1])

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a)
  if (hex) return isPrivateV4(hexPairToDotted(hex[1], hex[2]))

  return false
}
