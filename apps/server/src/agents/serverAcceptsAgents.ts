import {isLoopbackHostname} from "./isLoopbackHostname"

import type {ServerConfig} from "../config/resolveServerConfig"

/**
 * Reports whether this server accepts agents at all: D10's trusted-certificate requirement — an
 * HTTPS public address and no self-signed certificate — with D11's loopback exception. A
 * `publicUrl` that does not parse is `false`, never a throw: this is the one function every
 * probe, route and later endpoint reads to answer the fact, and a probe must always answer.
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
