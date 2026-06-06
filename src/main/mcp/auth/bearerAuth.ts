import {timingSafeEqual} from "node:crypto"

import {logger} from "@/utils/logger"

import {MCP_AUTH_LOCKOUT_DURATION_MS, MCP_AUTH_LOCKOUT_THRESHOLD, MCP_AUTH_LOCKOUT_WINDOW_MS} from "@/mcp/constants"

import type {McpAuthResult} from "@/mcp/types"

type FailureState = {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

export type BearerAuthOptions = {
  threshold?: number
  windowMs?: number
  lockoutMs?: number
}

export class BearerAuth {
  private failures = new Map<string, FailureState>()
  private readonly threshold: number
  private readonly windowMs: number
  private readonly lockoutMs: number

  constructor(
    private token: string,
    opts: BearerAuthOptions = {},
  ) {
    this.threshold = opts.threshold ?? MCP_AUTH_LOCKOUT_THRESHOLD
    this.windowMs = opts.windowMs ?? MCP_AUTH_LOCKOUT_WINDOW_MS
    this.lockoutMs = opts.lockoutMs ?? MCP_AUTH_LOCKOUT_DURATION_MS
  }

  rotateToken(next: string): void {
    this.token = next
    this.failures.clear()
  }

  check(header: string | undefined, ip: string): McpAuthResult {
    const now = Date.now()
    const state = this.failures.get(ip)

    if (state && state.lockedUntil > now) {
      logger.warn(logger.CONTEXT.MCP, `Auth locked out for ${ip}`)
      return {ok: false, reason: "locked_out", status: 429}
    }

    if (!header) return this.recordFailure(ip, now, "missing_header")

    const match = /^Bearer (.*)$/.exec(header)
    if (!match) return this.recordFailure(ip, now, "invalid_scheme")

    const supplied = match[1]
    if (!this.token || !this.constantTimeEquals(supplied, this.token)) {
      return this.recordFailure(ip, now, "wrong_token")
    }

    this.failures.delete(ip)
    return {ok: true}
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  }

  private recordFailure(ip: string, now: number, reason: "missing_header" | "invalid_scheme" | "wrong_token"): McpAuthResult {
    const state = this.failures.get(ip)

    if (!state || now - state.firstFailureAt > this.windowMs) {
      this.failures.set(ip, {failures: 1, firstFailureAt: now, lockedUntil: 0})
    } else {
      state.failures += 1
      if (state.failures >= this.threshold) state.lockedUntil = now + this.lockoutMs
    }

    logger.warn(logger.CONTEXT.MCP, `Auth failure (${reason}) from ${ip}`)
    return {ok: false, reason, status: 401}
  }
}
