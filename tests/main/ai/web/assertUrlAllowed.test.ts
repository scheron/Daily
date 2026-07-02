// @ts-nocheck
import {describe, expect, it} from "vitest"

import {WebFetchError} from "@shared/errors/web/WebFetchError"

import {assertUrlAllowed} from "@main/ai/web/utils/assertUrlAllowed"

// Fake DNS: hostname → addresses. Public hosts resolve to a public IP.
function fakeLookup(map) {
  return async (hostname) => {
    if (map[hostname]) return map[hostname]
    return [{address: "93.184.216.34", family: 4}] // example.com, public
  }
}

const lookup = fakeLookup({
  "internal.example": [{address: "10.0.0.5", family: 4}],
  "rebind.example": [{address: "127.0.0.1", family: 4}],
})

describe("assertUrlAllowed", () => {
  it("allows a public https URL", async () => {
    const url = await assertUrlAllowed("https://example.com/post", {lookup})
    expect(url.hostname).toBe("example.com")
  })

  it.each(["ftp://example.com/x", "file:///etc/passwd", "data:text/html,hi", "gopher://example.com"])("rejects disallowed scheme: %s", async (u) => {
    await expect(assertUrlAllowed(u, {lookup})).rejects.toBeInstanceOf(WebFetchError)
  })

  it("rejects embedded credentials", async () => {
    await expect(assertUrlAllowed("https://user:pass@example.com", {lookup})).rejects.toBeInstanceOf(WebFetchError)
  })

  it.each([
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
  ])("blocks internal literal: %s", async (u) => {
    await expect(assertUrlAllowed(u, {lookup})).rejects.toBeInstanceOf(WebFetchError)
  })

  it.each([
    "http://[::ffff:7f00:1]/", // 127.0.0.1 loopback
    "http://[::ffff:a9fe:a9fe]/", // 169.254.169.254 cloud metadata
    "http://[::ffff:c0a8:101]/", // 192.168.1.1
    "http://[::ffff:a00:1]/", // 10.0.0.1
    "http://[::ffff:ac10:1]/", // 172.16.0.1
    "http://[::ffff:6440:1]/", // 100.64.0.1 CGNAT
    "http://[ff02::1]/", // multicast
  ])("blocks IPv4-mapped IPv6 and multicast: %s", async (u) => {
    await expect(assertUrlAllowed(u, {lookup})).rejects.toBeInstanceOf(WebFetchError)
  })

  it("blocks a public hostname that resolves to a private IP (DNS rebinding)", async () => {
    await expect(assertUrlAllowed("http://internal.example/", {lookup})).rejects.toBeInstanceOf(WebFetchError)
    await expect(assertUrlAllowed("http://rebind.example/", {lookup})).rejects.toBeInstanceOf(WebFetchError)
  })
})
