import {AGENT_ENDPOINT_PATH} from "@daily/protocol"

import {touchAgent} from "../../agents/AgentStore"
import {agentUrls} from "../../agents/agentUrls"
import {respondAgentsNotAccepted, respondJson} from "../../agents/http/agentResponses"
import {readAgentBody} from "../../agents/http/readAgentBody"
import {handleMcpRequest} from "../../agents/mcp/handleMcpRequest"
import {verifyAgentAccessToken} from "../../agents/oauth/AgentTokenStore"
import {RESPONSE_SENT} from "../respond"

import type {Route, RouteContext} from "../createHttpServer"

/**
 * `POST /mcp` — the agent endpoint, not a Daily Sync Protocol route. Refuses a server that does
 * not accept agents, a foreign `Origin`, a missing bearer and one that doesn't verify — the last
 * two with the `401` challenge pointing at the protected resource metadata — then records the
 * agent's last use and answers `handleMcpRequest` as its Mac. `GET` and `DELETE` on this path
 * answer `405` through `matchRoute`, which has no route of its own for them.
 */
export const mcpRoute: Route = {
  method: "POST",
  path: AGENT_ENDPOINT_PATH,
  body: "stream",
  handler: postMcp,
}

async function postMcp(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondAgentsNotAccepted(ctx.res)

  const origin = readHeaderValue(ctx.req.headers.origin)
  if (origin !== null && !isAllowedOrigin(origin, urls.issuer)) {
    return respondJson(ctx.res, 403, {jsonrpc: "2.0", error: {code: -32600, message: "Origin not allowed"}})
  }

  const authorization = readHeaderValue(ctx.req.headers.authorization)
  const bearer = authorization !== null ? /^Bearer (\S+)$/i.exec(authorization) : null
  if (!bearer) {
    return respondJson(
      ctx.res,
      401,
      {error: "unauthorized", error_description: "This request needs a bearer access token"},
      {"www-authenticate": `Bearer resource_metadata="${urls.resourceMetadata}"`},
    )
  }

  const caller = verifyAgentAccessToken(ctx.store, bearer[1], urls.resource)
  if (!caller) {
    return respondJson(
      ctx.res,
      401,
      {error: "invalid_token", error_description: "The access token is invalid, expired or revoked"},
      {
        "www-authenticate": `Bearer error="invalid_token", error_description="The access token is invalid, expired or revoked", resource_metadata="${urls.resourceMetadata}"`,
      },
    )
  }

  touchAgent(ctx.store, caller.agentId)

  const body = await readAgentBody(ctx.req, 1024 * 1024)
  if (body === null) {
    return respondJson(ctx.res, 413, {jsonrpc: "2.0", id: null, error: {code: -32600, message: "Request body too large"}})
  }

  const reply = await handleMcpRequest({store: ctx.store}, {deviceId: caller.deviceId, timeZone: caller.timeZone}, body, {
    protocolVersion: readHeaderValue(ctx.req.headers["mcp-protocol-version"]),
    method: readHeaderValue(ctx.req.headers["mcp-method"]),
    name: readHeaderValue(ctx.req.headers["mcp-name"]),
  })

  if (reply.status === 202) {
    ctx.res.writeHead(202)
    ctx.res.end()
    return RESPONSE_SENT
  }

  return respondJson(ctx.res, reply.status, reply.body)
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value[0] ?? null

  return null
}

function isAllowedOrigin(origin: string, issuer: string): boolean {
  try {
    return new URL(origin).origin === new URL(issuer).origin
  } catch {
    return false
  }
}
