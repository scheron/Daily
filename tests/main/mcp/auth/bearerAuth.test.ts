// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {BearerAuth} from "@main/mcp/auth/bearerAuth"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

describe("BearerAuth", () => {
  let auth: BearerAuth

  beforeEach(() => {
    auth = new BearerAuth("secret-token-123")
  })

  it("accepts a correct Authorization header", () => {
    const r = auth.check("Bearer secret-token-123", "1.2.3.4")
    expect(r).toEqual({ok: true})
  })

  it("rejects missing header", () => {
    const r = auth.check(undefined, "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "missing_header", status: 401})
  })

  it("rejects header with wrong scheme", () => {
    const r = auth.check("Basic abc", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "invalid_scheme", status: 401})
  })

  it("rejects wrong token", () => {
    const r = auth.check("Bearer nope", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "wrong_token", status: 401})
  })

  it("locks out after 5 failures within the window", () => {
    for (let i = 0; i < 5; i++) auth.check("Bearer nope", "1.2.3.4")
    const r = auth.check("Bearer secret-token-123", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "locked_out", status: 429})
  })

  it("does not lock out a different IP", () => {
    for (let i = 0; i < 5; i++) auth.check("Bearer nope", "1.2.3.4")
    const r = auth.check("Bearer secret-token-123", "5.6.7.8")
    expect(r).toEqual({ok: true})
  })

  it("lockout expires after lockoutDurationMs", () => {
    const auth2 = new BearerAuth("t", {
      threshold: 2,
      windowMs: 1_000,
      lockoutMs: 50,
    })
    auth2.check("Bearer x", "1.1.1.1")
    auth2.check("Bearer x", "1.1.1.1")
    expect(auth2.check("Bearer t", "1.1.1.1")).toEqual({ok: false, reason: "locked_out", status: 429})

    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(auth2.check("Bearer t", "1.1.1.1")).toEqual({ok: true})
        resolve()
      }, 80),
    )
  })

  it("rotateToken invalidates the previous token", () => {
    expect(auth.check("Bearer secret-token-123", "1.1.1.1")).toEqual({ok: true})
    auth.rotateToken("new-token")
    expect(auth.check("Bearer secret-token-123", "2.2.2.2")).toEqual({
      ok: false,
      reason: "wrong_token",
      status: 401,
    })
    expect(auth.check("Bearer new-token", "2.2.2.2")).toEqual({ok: true})
  })

  it("treats empty token as never-matching", () => {
    const a = new BearerAuth("")
    expect(a.check("Bearer ", "1.1.1.1")).toEqual({ok: false, reason: "wrong_token", status: 401})
    expect(a.check("Bearer anything", "1.1.1.1")).toEqual({ok: false, reason: "wrong_token", status: 401})
  })
})
