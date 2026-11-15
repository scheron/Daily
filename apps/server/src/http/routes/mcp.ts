import {AGENT_ENDPOINT_PATH} from "@daily/protocol"
import {ToolErrorCode} from "@daily/tools"

import {touchAgent} from "../../agents/AgentStore"
import {agentUrls} from "../../agents/agentUrls"
import {respondAgentsNotAccepted, respondJson} from "../../agents/http/agentResponses"
import {readAgentBody} from "../../agents/http/readAgentBody"
import {handleMcpRequest} from "../../agents/mcp/handleMcpRequest"
import {verifyAgentAccessToken} from "../../agents/oauth/AgentTokenStore"
import {runAgentTool} from "../../agents/runAgentTool"
import {isSearchedRead} from "../../agents/search/SearchRunner"
import {readBearerToken} from "../readBearerToken"
import {RESPONSE_SENT} from "../respond"

import type {AgentIdentity} from "../../agents/AgentWorkspace"
import type {McpReply} from "../../agents/mcp/handleMcpRequest"
import type {AgentToolCall, AgentToolOutcome} from "../../agents/runAgentTool"
import type {SearchOutcome} from "../../agents/search/SearchRunner"
import type {Route, RouteContext} from "../createHttpServer"

/** MCP calls are authenticated as the agent and run using its approving Mac's workspace. */
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

  const accessToken = readBearerToken(ctx.req)
  if (accessToken === null) {
    return respondJson(
      ctx.res,
      401,
      {error: "unauthorized", error_description: "This request needs a bearer access token"},
      {"www-authenticate": `Bearer resource_metadata="${urls.resourceMetadata}"`},
    )
  }

  const caller = verifyAgentAccessToken(ctx.store, accessToken, urls.resource)
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
  if (ctx.res.destroyed) return RESPONSE_SENT
  if (body === null) {
    return respondJson(ctx.res, 413, {jsonrpc: "2.0", id: null, error: {code: -32600, message: "Request body too large"}})
  }

  const mcpCaller = {deviceId: caller.deviceId, timeZone: caller.timeZone, name: caller.name}
  const headers = {
    protocolVersion: readHeaderValue(ctx.req.headers["mcp-protocol-version"]),
    method: readHeaderValue(ctx.req.headers["mcp-method"]),
    name: readHeaderValue(ctx.req.headers["mcp-name"]),
  }
  const {agentId} = caller
  const sessionId = readHeaderValue(ctx.req.headers["mcp-session-id"])
  const legacySessions = ctx.legacyMcpSessions
  const legacy: {request: Exclude<ReturnType<typeof legacySessions.begin>, false>} = {request: null}
  const search = new AbortController()
  ctx.res.once("close", cancelSearch)
  if (ctx.res.destroyed) cancelSearch()

  let reply: McpReply
  try {
    reply = await handleMcpRequest(
      {store: ctx.store, journal: ctx.mcpJournal, executeTool},
      mcpCaller,
      body,
      headers,
      sessionId === null
        ? null
        : {
            begin(id) {
              const request = legacySessions.begin(agentId, sessionId, id)
              if (request === false) return false

              legacy.request = request
              if (request) request.cancel = cancelSearch
              return true
            },
            notify(cancelId) {
              return legacySessions.notify(agentId, sessionId, cancelId)
            },
          },
    )
  } finally {
    ctx.res.off("close", cancelSearch)
    if (legacy.request) legacy.request.cancel = null
  }

  if (ctx.res.destroyed) return RESPONSE_SENT
  if (reply.status === 202) {
    ctx.res.writeHead(202)
    ctx.res.end()
    return RESPONSE_SENT
  }

  const newSessionId = reply.legacyInitializeId === undefined ? null : legacySessions.open(agentId, reply.legacyInitializeId)
  return respondJson(ctx.res, reply.status, reply.body, newSessionId ? {"mcp-session-id": newSessionId} : {})

  async function executeTool(agent: AgentIdentity, call: AgentToolCall): Promise<AgentToolOutcome | SearchOutcome> {
    if (!isSearchedRead(call)) {
      if (ctx.res.destroyed) return {ok: false, error: {code: ToolErrorCode.REQUEST_CANCELLED, message: "The client disconnected."}}
      return runAgentTool({store: ctx.store}, agent, call)
    }

    if (ctx.res.destroyed) cancelSearch()
    if (search.signal.aborted) return {ok: false, error: {code: ToolErrorCode.SEARCH_CANCELLED, message: "Search cancelled."}}

    const submission = ctx.searchRunner.submit(agentId, agent, call)
    search.signal.addEventListener("abort", () => submission.cancel(), {once: true})
    return submission.outcome
  }

  function cancelSearch() {
    search.abort()
  }
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
