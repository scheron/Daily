import {isIP} from "node:net"

/**
 * Collapses hostile IPv4 literals (decimal `2130706433`, short `127.1`,
 * octal `0177.0.0.1`, hex) to dotted form so range checks catch them. Returns
 * the input unchanged when it is already a valid IP, or null when it is not a
 * bare numeric literal (e.g. a hostname).
 *
 * @example normalizeIpLiteral("2130706433") // "127.0.0.1"
 * @example normalizeIpLiteral("example.com") // null
 */
export function normalizeIpLiteral(host: string): string | null {
  if (isIP(host) !== 0) return host
  if (!/^[0-9oxX.]+$/.test(host)) return null

  const parts = host.split(".")
  const nums: number[] = []
  for (const p of parts) {
    if (p === "") return null
    let n: number
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) n = parseInt(p, 16)
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8)
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10)
    else return null
    if (!Number.isFinite(n)) return null
    nums.push(n)
  }

  // Forms: a, a.b, a.b.c, a.b.c.d (BSD inet_aton semantics, simplified).
  let value: number
  if (nums.length === 1) value = nums[0]
  else if (nums.length === 2) value = (nums[0] << 24) | nums[1]
  else if (nums.length === 3) value = (nums[0] << 24) | (nums[1] << 16) | nums[2]
  else if (nums.length === 4) value = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]
  else return null

  const u = value >>> 0
  return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff].join(".")
}
