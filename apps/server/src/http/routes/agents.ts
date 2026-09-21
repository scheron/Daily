import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {
  approveAgentRequest,
  closeAgentWindow,
  denyAgentRequest,
  findAgentById,
  findPendingAgentRequest,
  listAgents,
  openAgentWindow,
  revokeAgent,
} from "../../agents/AgentStore"
import {agentUrls} from "../../agents/agentUrls"
import {serverAcceptsAgents} from "../../agents/serverAcceptsAgents"
import {authenticateRequest} from "../../devices/authenticateRequest"
import {writeDeviceTimeZone} from "../../devices/DeviceStore"
import {isUsableTimeZone} from "../../devices/timeZone"
import {isClaimed, readAgentWindow} from "../../identity/ServerIdentityStore"

import type {AgentListResponse, AgentWindow, ApproveAgentBody, DenyAgentBody, PendingAgentRequestResponse, RevokeAgentBody} from "@daily/protocol"
import type {AgentWindowState} from "../../agents/AgentStore"
import type {ServerConfig} from "../../config/resolveServerConfig"
import type {DeviceRecord} from "../../devices/DeviceStore"
import type {ServerStore} from "../../store/instance"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/agents` — any bound Mac reads the list: the Parent every Mac's, a Child only its own. */
export const agentsRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.agents,
  handler: getAgents,
}

/** `POST /v1/agents/revoke` — a Child revokes only its own agent; the Parent revokes any, refused `AGENT_NOT_FOUND` for an unknown id. */
export const agentRevokeRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentRevoke,
  handler: postAgentRevoke,
}

/** `POST /v1/agents/window/open` — refused `AGENTS_NOT_SUPPORTED` unless this server accepts agents; any bound Mac may open one. */
export const agentWindowOpenRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentWindowOpen,
  handler: postAgentWindowOpen,
}

/** `POST /v1/agents/window/close` — the window's own Mac closes it; another Mac is refused `NOT_AGENT_OWNER`; answers regardless of whether this server accepts agents. */
export const agentWindowCloseRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentWindowClose,
  handler: postAgentWindowClose,
}

/** `GET /v1/agents/pending` — the request waiting on the calling Mac's own window, `{request: null}` for any other Mac. */
export const agentPendingRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.agentPending,
  handler: getAgentPending,
}

/** `POST /v1/agents/approve` — the window's own Mac approves the waiting request; refused `INVALID_TIME_ZONE` without a usable one, minting nothing. */
export const agentApproveRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentApprove,
  handler: postAgentApprove,
}

/** `POST /v1/agents/deny` — the window's own Mac refuses the waiting request, leaving the window open. */
export const agentDenyRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentDeny,
  handler: postAgentDeny,
}

async function getAgents(ctx: RouteContext): Promise<AgentListResponse> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  return readAgentListResponse(ctx.store, ctx.config, device)
}

async function postAgentRevoke(ctx: RouteContext): Promise<AgentListResponse> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<RevokeAgentBody>
  if (typeof body.agentId !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A revoke needs an agentId")
  }

  const agent = findAgentById(ctx.store, body.agentId)
  if (!agent) throw new ProtocolError(ProtocolErrorCode.AGENT_NOT_FOUND, `No such agent: ${body.agentId}`)

  if (device.role !== "parent" && agent.deviceId !== device.id) {
    throw new ProtocolError(ProtocolErrorCode.NOT_AGENT_OWNER, "This agent belongs to a different Mac")
  }

  revokeAgent(ctx.store, body.agentId)

  return readAgentListResponse(ctx.store, ctx.config, device)
}

async function postAgentWindowOpen(ctx: RouteContext): Promise<AgentWindow> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  if (!serverAcceptsAgents(ctx.config)) {
    throw new ProtocolError(ProtocolErrorCode.AGENTS_NOT_SUPPORTED, "This server does not accept agents")
  }

  const window = toAgentWindow(openAgentWindow(ctx.store, device.id), ctx.config)
  if (!window) throw new ProtocolError(ProtocolErrorCode.INTERNAL, "Opened an Agent window but could not build its address")

  return window
}

async function postAgentWindowClose(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const window = readAgentWindow(ctx.store)
  if (window && window.deviceId !== device.id) {
    throw new ProtocolError(ProtocolErrorCode.NOT_AGENT_OWNER, "This Agent window belongs to a different Mac")
  }

  closeAgentWindow(ctx.store)
}

async function getAgentPending(ctx: RouteContext): Promise<PendingAgentRequestResponse> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const record = findPendingAgentRequest(ctx.store, device.id)
  if (!record) return {request: null}

  return {
    request: {
      requestId: record.id,
      code: record.code,
      agentName: record.agentName,
      returnsTo: record.returnsTo,
      isLocalProgram: record.isLocalProgram,
      requestedAt: record.createdAt,
      expiresAt: record.expiresAt,
    },
  }
}

async function postAgentApprove(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<ApproveAgentBody>
  if (typeof body.requestId !== "string" || typeof body.code !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "An approval needs a request id and a code")
  }

  if (!isUsableTimeZone(body.timeZone)) {
    throw new ProtocolError(ProtocolErrorCode.INVALID_TIME_ZONE, "An agent approval needs the approving Mac's time zone")
  }

  writeDeviceTimeZone(ctx.store, device.id, body.timeZone)
  approveAgentRequest(ctx.store, body.requestId, body.code, device.id)
}

async function postAgentDeny(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<DenyAgentBody>
  if (typeof body.requestId !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A denial needs a request id")
  }

  denyAgentRequest(ctx.store, body.requestId, device.id)
}

function readAgentListResponse(store: ServerStore, config: ServerConfig, device: DeviceRecord): AgentListResponse {
  return {
    agents: listAgents(store, device.role === "parent" ? null : device.id).map((agent) => ({
      id: agent.id,
      deviceId: agent.deviceId,
      name: agent.name,
      createdAt: agent.createdAt,
      lastUsedAt: agent.lastUsedAt,
      revokedAt: agent.revokedAt,
    })),
    agentWindow: toAgentWindow(readAgentWindow(store), config),
  }
}

function toAgentWindow(state: AgentWindowState | null, config: ServerConfig): AgentWindow | null {
  const urls = agentUrls(config)
  if (!state || !urls) return null

  return {
    expiresAt: state.expiresAt,
    deviceId: state.deviceId,
    agentAddress: urls.resource,
  }
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}
