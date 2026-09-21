import {isLoopbackHostname} from "./isLoopbackHostname"

import type {ServerConfig} from "../config/resolveServerConfig"

/**
 * Reports whether this server accepts agents at all: an HTTPS public address on a certificate that
 * is not self-signed, since claude.ai and Claude's mobile app reach the server from Anthropic's
 * network and refuse a self-signed one — or a loopback address, which OAuth 2.1 counts as secure. A
 * `publicUrl` that does not parse is `false`, never a throw: every probe and agent route reads the
 * fact from this one function, and a probe must always answer.
 */
export function serverAcceptsAgents(config: ServerConfig): boolean {
  if (config.transport === "self-signed") return false
  if (!config.publicUrl) return false

  let url: URL
  try {
    url = new URL(config.publicUrl)
  } catch {
    return false
  }

  return url.protocol === "https:" || isLoopbackHostname(url.hostname)
}
