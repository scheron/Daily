import {isIP} from "node:net"

/**
 * True if the IP is loopback / private / link-local / CGNAT / multicast /
 * reserved — i.e. must not be reached by an outbound fetch (SSRF defense).
 *
 * @example isBlockedAddress("127.0.0.1") // true
 * @example isBlockedAddress("93.184.216.34") // false
 */
export function isBlockedAddress(address: string): boolean {
  const v = isIP(address)
  if (v === 4) return isBlockedV4(address)
  if (v === 6) return isBlockedV6(address)
  return true // unparseable → block
}

function isBlockedV4(address: string): boolean {
  const o = address.split(".").map(Number)
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = o
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isBlockedV6(address: string): boolean {
  const a = address.toLowerCase()
  if (a === "::1" || a === "::") return true
  if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd")) return true // link-local + ULA
  if (a.startsWith("ff")) return true // multicast ff00::/8

  const mappedDotted = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped, dotted form
  if (mappedDotted) return isBlockedV4(mappedDotted[1])

  const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/) // IPv4-mapped, hex-grouped form (what new URL() produces)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    return isBlockedV4(dotted)
  }

  return false
}
