import {randomUUID} from "node:crypto"

export type McpRequestId = string | number

type LegacyRequest = {cancel: (() => void) | null}
type LegacySession = {agentId: string; expiresAt: number; requests: Map<McpRequestId, LegacyRequest>}

const MAX_REQUESTS_PER_SESSION = 1024

export class LegacyMcpSessions {
  private readonly _sessions = new Map<string, LegacySession>()

  open(agentId: string, initializeId: McpRequestId): string | null {
    const now = performance.now()
    for (const [id, session] of this._sessions) {
      if (now >= session.expiresAt || (session.requests.size >= MAX_REQUESTS_PER_SESSION && !hasLiveSearch(session))) this._sessions.delete(id)
    }

    if (this._sessions.size >= 128) return null

    const id = randomUUID()
    const requests = new Map<McpRequestId, LegacyRequest>([[initializeId, {cancel: null}]])
    this._sessions.set(id, {agentId, requests, expiresAt: now + 3_600_000})
    return id
  }

  begin(agentId: string, sessionId: string, id: McpRequestId | null): LegacyRequest | null | false {
    const session = this._get(agentId, sessionId)
    if (!session) return false

    // Retain used IDs for the entire session so a late notification cannot cancel a later call.
    const previous = id === null ? null : session.requests.get(id)
    if (previous) previous.cancel = null
    if (session.requests.size >= MAX_REQUESTS_PER_SESSION) return false
    if (id === null || previous) return null

    const request = {cancel: null}
    session.requests.set(id, request)
    return request
  }

  notify(agentId: string, sessionId: string, cancelId: McpRequestId | null): boolean {
    const session = this._get(agentId, sessionId)
    if (!session) return false

    const request = cancelId === null ? null : session.requests.get(cancelId)
    if (!request?.cancel) return session.requests.size < MAX_REQUESTS_PER_SESSION

    const cancel = request.cancel
    request.cancel = null
    cancel()
    return true
  }

  private _get(agentId: string, sessionId: string): LegacySession | null {
    const session = this._sessions.get(sessionId)
    if (!session || session.agentId !== agentId) return null

    if (performance.now() >= session.expiresAt) {
      this._sessions.delete(sessionId)
      return null
    }

    return session
  }
}

function hasLiveSearch(session: LegacySession): boolean {
  for (const request of session.requests.values()) {
    if (request.cancel) return true
  }
  return false
}
