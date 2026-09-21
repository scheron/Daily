/**
 * Reports whether `hostname` is one of the three forms `URL.hostname` produces for loopback:
 * `localhost`, `127.0.0.1`, or IPv6 `::1` in its bracketed form, `[::1]`.
 */
export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}
