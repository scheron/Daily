import {AGENT_ENDPOINT_PATH} from "@daily/protocol"

import {serverAcceptsAgents} from "./serverAcceptsAgents"

import type {ServerConfig} from "../config/resolveServerConfig"

/**
 * The OAuth and MCP paths mounted alongside the Daily Sync Protocol's own routes, which they are
 * not part of.
 */
export const AGENT_OAUTH_PATHS = {
  protectedResource: "/.well-known/oauth-protected-resource",
  authorizationServer: "/.well-known/oauth-authorization-server",
  authorize: "/oauth/authorize",
  consent: "/oauth/consent",
  consentStatus: "/oauth/consent/status",
  token: "/oauth/token",
} as const

export type AgentUrls = {
  issuer: string
  resource: string
  resourceMetadata: string
  authorizationEndpoint: string
  tokenEndpoint: string
}

/**
 * Every URL an agent endpoint needs, built once from `config.publicUrl` — `null` exactly when
 * `serverAcceptsAgents(config)` is `false`, so every OAuth and MCP route refuses from this one
 * fact.
 */
export function agentUrls(config: ServerConfig): AgentUrls | null {
  if (!config.publicUrl || !serverAcceptsAgents(config)) return null

  const issuer = config.publicUrl.replace(/\/+$/, "")

  return {
    issuer,
    resource: `${issuer}${AGENT_ENDPOINT_PATH}`,
    resourceMetadata: `${issuer}${AGENT_OAUTH_PATHS.protectedResource}${AGENT_ENDPOINT_PATH}`,
    authorizationEndpoint: `${issuer}${AGENT_OAUTH_PATHS.authorize}`,
    tokenEndpoint: `${issuer}${AGENT_OAUTH_PATHS.token}`,
  }
}

/**
 * Reports whether `candidate` names `urls.resource` under MCP's `basic/authorization`
 * canonicalisation: scheme, host and path must match, case- and default-port-insensitively, with
 * one trailing slash on either side ignored; a username, password, query or fragment refuses.
 */
export function isAgentResource(urls: AgentUrls, candidate: string): boolean {
  let candidateUrl: URL
  let resourceUrl: URL
  try {
    candidateUrl = new URL(candidate)
    resourceUrl = new URL(urls.resource)
  } catch {
    return false
  }

  if (candidateUrl.username || candidateUrl.password || candidateUrl.search || candidateUrl.hash) return false

  const stripTrailingSlash = (pathname: string): string => pathname.replace(/\/$/, "")

  return (
    candidateUrl.protocol === resourceUrl.protocol &&
    candidateUrl.host === resourceUrl.host &&
    stripTrailingSlash(candidateUrl.pathname) === stripTrailingSlash(resourceUrl.pathname)
  )
}
