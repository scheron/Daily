import {DateTime} from "luxon"
import {describe, expect, it, vi} from "vitest"

import {KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {
  AGENT_OAUTH_TEST_PATHS,
  bootAgentServer,
  claimParent,
  claudeAppDocument,
  claudeCodeDocument,
  codexDocument,
  connectAgent,
  openAgentWindowOver,
  readAgentsList,
  registerClientDocument,
  revokeAgentOver,
  startClientDocumentServer,
} from "../oauth/harness"

import type {BootedAgentServer} from "../oauth/harness"

function statelessRequest(
  id: number | string,
  method: string,
  params: Record<string, unknown> = {},
  mcpName?: string,
): {body: string; headers: Record<string, string>} {
  const meta = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}
  const body = JSON.stringify({jsonrpc: "2.0", id, method, params: {...params, _meta: meta}})
  const headers: Record<string, string> = {"content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": method}
  if (mcpName !== undefined) headers["mcp-name"] = mcpName

  return {body, headers}
}

function postMcp(booted: BootedAgentServer, token: string | null, body: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = {"content-type": "application/json", ...extraHeaders}
  if (token !== null) headers.authorization = `Bearer ${token}`

  return fetch(`${booted.baseUrl}${AGENT_ENDPOINT_PATH}`, {method: "POST", headers, body})
}

function readLastUsedAt(booted: BootedAgentServer, agentId: string): string | null {
  const row = booted.store.db.prepare(`SELECT last_used_at FROM agents WHERE id = ?`).get(agentId) as {last_used_at: string | null}
  return row.last_used_at
}

async function writeInitialSnapshot(booted: BootedAgentServer, token: string): Promise<void> {
  const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
    body: JSON.stringify({
      expectedRevision: null,
      snapshot: {
        version: KNOWN_SNAPSHOT_VERSION,
        meta: {updatedAt: new Date().toISOString(), hash: "seed"},
        docs: {tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], files: [], events: []},
      },
    }),
  })
  if (res.status !== 200) throw new Error(`expected the harness's snapshot seed to succeed, got ${res.status}`)
}

describe("POST /mcp challenges a missing or unusable-shaped bearer — TC-52", () => {
  it("TC-52: the same 401 challenge, pointing at the metadata document it names, answers a missing bearer and a Basic one alike", async () => {
    const booted = await bootAgentServer()
    try {
      const challenge = `Bearer resource_metadata="${booted.issuer}${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp"`

      const noAuth = await postMcp(booted, null, "{}")
      expect(noAuth.status).toBe(401)
      expect(noAuth.headers.get("www-authenticate")).toBe(challenge)
      expect(noAuth.headers.get("www-authenticate")).not.toContain("error=")

      const basicAuth = await fetch(`${booted.baseUrl}${AGENT_ENDPOINT_PATH}`, {
        method: "POST",
        headers: {"content-type": "application/json", authorization: "Basic x"},
        body: "{}",
      })
      expect(basicAuth.status).toBe(401)
      expect(basicAuth.headers.get("www-authenticate")).toBe(challenge)
      expect(basicAuth.headers.get("www-authenticate")).not.toContain("error=")

      const metadataRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp`)
      expect(metadataRes.status).toBe(200)
      expect(await metadataRes.json()).toEqual({
        resource: `${booted.issuer}${AGENT_ENDPOINT_PATH}`,
        authorization_servers: [booted.issuer],
        bearer_methods_supported: ["header"],
        resource_name: "Daily",
      })
    } finally {
      await booted.close()
    }
  })
})

describe("POST /mcp refuses a token that is not a live, unexpired access token of this resource — TC-53", () => {
  it("TC-53: a garbage token, a Mac's own credential, a refresh token, an expired one and a revoked one are all invalid_token; GET /v1/agents refuses the protocol's own way", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const challenge = `Bearer error="invalid_token", error_description="The access token is invalid, expired or revoked", resource_metadata="${booted.issuer}${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp"`

      const garbage = await postMcp(booted, "garbage-token", "{}")
      expect(garbage.status).toBe(401)
      expect(garbage.headers.get("www-authenticate")).toBe(challenge)

      const macCredential = await postMcp(booted, parent.token, "{}")
      expect(macCredential.status).toBe(401)
      expect(macCredential.headers.get("www-authenticate")).toBe(challenge)

      const refreshAsAccess = await postMcp(booted, connected.refreshToken, "{}")
      expect(refreshAsAccess.status).toBe(401)
      expect(refreshAsAccess.headers.get("www-authenticate")).toBe(challenge)

      vi.useFakeTimers({toFake: ["Date"]})
      try {
        vi.setSystemTime(new Date(Date.now() + 3_601_000))
        const expired = await postMcp(booted, connected.accessToken, "{}")
        expect(expired.status).toBe(401)
        expect(expired.headers.get("www-authenticate")).toBe(challenge)
      } finally {
        vi.useRealTimers()
      }

      const agents = await readAgentsList(booted, parent.token)
      const agent = agents.agents.find((a) => a.revokedAt === null)
      if (!agent) throw new Error("expected the connected agent to be listed")
      await revokeAgentOver(booted, parent.token, agent.id)

      const revoked = await postMcp(booted, connected.accessToken, "{}")
      expect(revoked.status).toBe(401)
      expect(revoked.headers.get("www-authenticate")).toBe(challenge)

      const listWithAgentToken = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {
        headers: {authorization: `Bearer ${connected.accessToken}`},
      })
      expect(listWithAgentToken.status).toBe(401)
      expect(await listWithAgentToken.json()).toEqual({ok: false, error: {code: "UNAUTHORIZED", message: expect.any(String)}})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the 2026-07-28 path answers as the caller's Mac and records last use — TC-54", () => {
  it("TC-54: server/discover, tools/list and tools/call save_task all answer over /mcp, the task lands on the Mac's own today in its own zone, and the agent's last use is recorded", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await writeInitialSnapshot(booted, parent.token)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const discover = statelessRequest(1, "server/discover")
      const discoverRes = await postMcp(booted, connected.accessToken, discover.body, discover.headers)
      expect(discoverRes.status).toBe(200)
      const discoverJson = (await discoverRes.json()) as {result: {resultType: string; supportedVersions: string[]}}
      expect(discoverJson.result.resultType).toBe("complete")
      expect(discoverJson.result.supportedVersions).toEqual(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"])

      const list = statelessRequest(2, "tools/list")
      const listRes = await postMcp(booted, connected.accessToken, list.body, list.headers)
      expect(listRes.status).toBe(200)
      const listJson = (await listRes.json()) as {result: {tools: unknown[]}}
      expect(listJson.result.tools).toHaveLength(15)

      const aucklandToday = DateTime.now().setZone("Pacific/Auckland").toISODate()
      const call = statelessRequest(3, "tools/call", {name: "save_task", arguments: {content: "Buy milk"}}, "save_task")
      const callRes = await postMcp(booted, connected.accessToken, call.body, call.headers)
      expect(callRes.status).toBe(200)
      const callJson = (await callRes.json()) as {result: {resultType: string; content: {type: string; text: string}[]}}
      expect(callJson.result.resultType).toBe("complete")
      const savedTask = (JSON.parse(callJson.result.content[0].text) as {task: {projectId: string; scheduled: {timezone: string; date: string}}}).task
      expect(savedTask.projectId).toBe("main")
      expect(savedTask.scheduled.timezone).toBe("Pacific/Auckland")
      expect(savedTask.scheduled.date).toBe(aucklandToday)

      const revisionRow = booted.store.db.prepare(`SELECT revision, written_by_device_id FROM snapshot`).get() as {
        revision: number
        written_by_device_id: string
      }
      expect(String(revisionRow.revision)).toBe("2")
      expect(revisionRow.written_by_device_id).toBe(parent.deviceId)

      const agents = await readAgentsList(booted, parent.token)
      const agent = agents.agents.find((a) => a.name === "Claude Code")
      expect(agent?.lastUsedAt).toBeTruthy()
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the 2025-11-25 path negotiates its version and reads without a session — TC-55", () => {
  it("TC-55: initialize answers the version it asked for, the notification is accepted, and the list reads back what was written, none of it carrying mcp-session-id", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await writeInitialSnapshot(booted, parent.token)

      const claudeCodeId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const claudeCodeAgent = await connectAgent(booted, parent.token, {clientId: claudeCodeId, redirectUri: "http://localhost:5555/callback"})

      const save = statelessRequest(1, "tools/call", {name: "save_task", arguments: {content: "Buy milk"}}, "save_task")
      const saveRes = await postMcp(booted, claudeCodeAgent.accessToken, save.body, save.headers)
      expect(saveRes.status).toBe(200)

      const codexId = registerClientDocument(docs, "/codex.json", codexDocument)
      await openAgentWindowOver(booted, parent.token)
      const codexAgent = await connectAgent(booted, parent.token, {clientId: codexId, redirectUri: "http://127.0.0.1:5555/callback"})

      const initBody = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "gate", version: "0"}},
      })
      const initRes = await postMcp(booted, codexAgent.accessToken, initBody)
      expect(initRes.status).toBe(200)
      const initJson = (await initRes.json()) as {result: {protocolVersion: string}}
      expect(initJson.result.protocolVersion).toBe("2025-06-18")
      expect(initJson.result).not.toHaveProperty("resultType")
      expect(initRes.headers.get("mcp-session-id")).toBeNull()

      const notifRes = await postMcp(booted, codexAgent.accessToken, JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}))
      expect(notifRes.status).toBe(202)
      expect(notifRes.headers.get("mcp-session-id")).toBeNull()

      const listRes = await postMcp(
        booted,
        codexAgent.accessToken,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "list_tasks", arguments: {}}}),
        {"mcp-protocol-version": "2025-06-18"},
      )
      expect(listRes.status).toBe(200)
      expect(listRes.headers.get("mcp-session-id")).toBeNull()
      const listJson = (await listRes.json()) as {result: {content: {type: string; text: string}[]}}
      const listResult = JSON.parse(listJson.result.content[0].text) as {tasks: {content: string}[]}
      expect(listResult.tasks.some((task) => task.content === "Buy milk")).toBe(true)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("last use moves on every accepted request, and only those — TC-56", () => {
  it("TC-56: lastUsedAt advances on two accepted requests in turn, and a request refused for a different agent's revoked token moves nobody's", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})
      const agentId = (await readAgentsList(booted, parent.token)).agents.find((a) => a.revokedAt === null)?.id
      if (!agentId) throw new Error("expected the connected agent to be listed")

      const otherClientId = registerClientDocument(docs, "/claude-app.json", claudeAppDocument)
      await openAgentWindowOver(booted, parent.token)
      const otherConnected = await connectAgent(booted, parent.token, {
        clientId: otherClientId,
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
      })
      const otherAgentId = (await readAgentsList(booted, parent.token)).agents.find((a) => a.id !== agentId && a.revokedAt === null)?.id
      if (!otherAgentId) throw new Error("expected a second agent to be listed")
      await revokeAgentOver(booted, parent.token, otherAgentId)

      vi.useFakeTimers({toFake: ["Date"]})
      try {
        vi.setSystemTime(new Date(Date.now() + 60_000))
        await postMcp(booted, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}))
        const t1 = readLastUsedAt(booted, agentId)
        expect(t1).toBeTruthy()

        vi.setSystemTime(new Date(Date.now() + 60_000))
        await postMcp(booted, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 2, method: "ping"}))
        const t2 = readLastUsedAt(booted, agentId)
        expect(t2).not.toBe(t1)

        vi.setSystemTime(new Date(Date.now() + 60_000))
        const refused = await postMcp(booted, otherConnected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 3, method: "ping"}))
        expect(refused.status).toBe(401)
        expect(readLastUsedAt(booted, agentId)).toBe(t2)
        expect(readLastUsedAt(booted, otherAgentId)).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a foreign Origin is refused before the body is read — TC-57", () => {
  it("TC-57: a foreign Origin is 403 with no id and moves no lastUsedAt; a matching or absent Origin both answer normally", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})
      const agentId = (await readAgentsList(booted, parent.token)).agents.find((a) => a.revokedAt === null)?.id
      if (!agentId) throw new Error("expected the connected agent to be listed")

      const before = readLastUsedAt(booted, agentId)

      const foreignOrigin = await postMcp(booted, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}), {
        origin: "https://evil.example",
      })
      expect(foreignOrigin.status).toBe(403)
      expect(await foreignOrigin.json()).toEqual({jsonrpc: "2.0", error: {code: -32600, message: expect.any(String)}})
      expect(readLastUsedAt(booted, agentId)).toBe(before)

      const matchingOrigin = await postMcp(booted, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 2, method: "ping"}), {
        origin: booted.issuer,
      })
      expect(matchingOrigin.status).toBe(200)

      const noOrigin = await postMcp(booted, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 3, method: "ping"}))
      expect(noOrigin.status).toBe(200)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a foreign Origin is refused before any bearer is asked for", () => {
  it("a foreign Origin with no bearer is 403 with no challenge, not the 401 an agent would answer by starting OAuth", async () => {
    const booted = await bootAgentServer()
    try {
      const res = await postMcp(booted, null, JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}), {origin: "https://evil.example"})

      expect(res.status).toBe(403)
      expect(res.headers.get("www-authenticate")).toBeNull()
      expect(await res.json()).toEqual({jsonrpc: "2.0", error: {code: -32600, message: expect.any(String)}})
    } finally {
      await booted.close()
    }
  })
})

describe("GET and DELETE are 405, and an oversized body is 413 in JSON-RPC's own shape — TC-58", () => {
  it("TC-58: GET and DELETE answer 405, and a body over 1 MiB is 413 with a JSON-RPC error carrying id null", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const getRes = await fetch(`${booted.baseUrl}${AGENT_ENDPOINT_PATH}`, {headers: {authorization: `Bearer ${connected.accessToken}`}})
      expect(getRes.status).toBe(405)

      const deleteRes = await fetch(`${booted.baseUrl}${AGENT_ENDPOINT_PATH}`, {
        method: "DELETE",
        headers: {authorization: `Bearer ${connected.accessToken}`},
      })
      expect(deleteRes.status).toBe(405)

      const oversizedBody = JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping", padding: "x".repeat(1024 * 1024 + 1)})
      const oversizedRes = await postMcp(booted, connected.accessToken, oversizedBody)
      expect(oversizedRes.status).toBe(413)
      expect(await oversizedRes.json()).toEqual({jsonrpc: "2.0", id: null, error: {code: -32600, message: expect.any(String)}})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a self-signed restart answers one fact on every agent path — TC-59", () => {
  it("TC-59: every agent path answers 404 agents_not_supported once self-signed, window/open keeps its own 409, and GET /v1/agents still lists what it knows", async () => {
    const accepting = await bootAgentServer({}, {deleteDataDirOnClose: false})
    const docs = await startClientDocumentServer()
    let selfSigned: BootedAgentServer | null = null
    const previousTls = process.env.DAILY_SERVER_TLS

    try {
      const parent = await claimParent(accepting)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(accepting, parent.token)
      const connected = await connectAgent(accepting, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const dataDir = accepting.dataDir
      await accepting.close()

      process.env.DAILY_SERVER_TLS = "self-signed"
      selfSigned = await bootAgentServer({dataDir, publicUrl: "https://192.0.2.10"})

      for (const path of [
        `${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp`,
        AGENT_OAUTH_TEST_PATHS.protectedResource,
        AGENT_OAUTH_TEST_PATHS.authorizationServer,
      ]) {
        const res = await fetch(`${selfSigned.baseUrl}${path}`)
        expect(res.status).toBe(404)
        expect(await res.json()).toMatchObject({error: "agents_not_supported"})
      }

      const mcpRes = await postMcp(selfSigned, connected.accessToken, JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}))
      expect(mcpRes.status).toBe(404)
      expect(await mcpRes.json()).toMatchObject({error: "agents_not_supported"})

      const authorizeRes = await fetch(`${selfSigned.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}`)
      expect(authorizeRes.status).toBe(404)
      expect(await authorizeRes.text()).toContain("This Daily server doesn't accept agents")

      const consentRes = await fetch(`${selfSigned.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=anything`)
      expect(consentRes.status).toBe(404)
      expect(await consentRes.text()).toContain("This Daily server doesn't accept agents")

      const tokenRes = await fetch(`${selfSigned.baseUrl}${AGENT_OAUTH_TEST_PATHS.token}`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({grant_type: "refresh_token", refresh_token: connected.refreshToken}).toString(),
      })
      expect(tokenRes.status).toBe(404)
      expect(await tokenRes.json()).toMatchObject({error: "agents_not_supported"})

      const windowOpenRes = await fetch(`${selfSigned.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`},
      })
      expect(windowOpenRes.status).toBe(409)
      expect(await windowOpenRes.json()).toEqual({ok: false, error: {code: "AGENTS_NOT_SUPPORTED", message: expect.any(String)}})

      const listRes = await fetch(`${selfSigned.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${parent.token}`}})
      expect(listRes.status).toBe(200)
      const listJson = (await listRes.json()) as {data: {agentWindow: unknown; agents: {name: string}[]}}
      expect(listJson.data.agentWindow).toBeNull()
      expect(listJson.data.agents.some((agent) => agent.name === "Claude Code")).toBe(true)
    } finally {
      if (previousTls === undefined) delete process.env.DAILY_SERVER_TLS
      else process.env.DAILY_SERVER_TLS = previousTls
      await docs.close()
      if (selfSigned) await selfSigned.close()
      else await accepting.close()
    }
  })
})

describe("the day a tool runs on follows the Mac, and answers gracefully once it is unknown — TC-60", () => {
  it("TC-60: a task lands on the probed zone's own date, not the zone approval happened in, and clearing the zone still answers tools/list while refusing save_task", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await writeInitialSnapshot(booted, parent.token)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const connected = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      vi.useFakeTimers({toFake: ["Date"]})
      try {
        vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"))

        const probeRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}?timeZone=Asia/Tokyo`, {
          headers: {authorization: `Bearer ${parent.token}`},
        })
        expect(probeRes.status).toBe(200)

        const save = statelessRequest(1, "tools/call", {name: "save_task", arguments: {content: "Tokyo task"}}, "save_task")
        const saveRes = await postMcp(booted, connected.accessToken, save.body, save.headers)
        expect(saveRes.status).toBe(200)
        const saveJson = (await saveRes.json()) as {result: {content: {type: string; text: string}[]}}
        const savedTask = (JSON.parse(saveJson.result.content[0].text) as {task: {scheduled: {timezone: string; date: string}}}).task
        expect(savedTask.scheduled.timezone).toBe("Asia/Tokyo")
        expect(savedTask.scheduled.date).toBe("2026-01-15")
      } finally {
        vi.useRealTimers()
      }

      booted.store.db.prepare(`UPDATE devices SET time_zone = NULL WHERE id = ?`).run(parent.deviceId)

      const listAfterZoneless = statelessRequest(2, "tools/list")
      const listRes = await postMcp(booted, connected.accessToken, listAfterZoneless.body, listAfterZoneless.headers)
      expect(listRes.status).toBe(200)
      const listJson = (await listRes.json()) as {result: {tools: unknown[]}}
      expect(listJson.result.tools).toHaveLength(15)

      const revisionBefore = (booted.store.db.prepare(`SELECT revision FROM snapshot`).get() as {revision: number}).revision

      const saveAfterZoneless = statelessRequest(3, "tools/call", {name: "save_task", arguments: {content: "should not save"}}, "save_task")
      const saveAfterRes = await postMcp(booted, connected.accessToken, saveAfterZoneless.body, saveAfterZoneless.headers)
      expect(saveAfterRes.status).toBe(200)
      const saveAfterJson = (await saveAfterRes.json()) as {result: {isError?: boolean; content: {type: string; text: string}[]}}
      expect(saveAfterJson.result.isError).toBe(true)
      expect(JSON.parse(saveAfterJson.result.content[0].text)).toEqual({
        error: {
          code: "MAC_TIME_ZONE_UNKNOWN",
          message:
            "This agent's Mac has not told the server its time zone yet, so the server cannot tell which day it is there. Open Daily on that Mac and let it sync once, then try again.",
        },
      })

      const revisionAfter = (booted.store.db.prepare(`SELECT revision FROM snapshot`).get() as {revision: number}).revision
      expect(revisionAfter).toBe(revisionBefore)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a comment written over /mcp is attributed to the agent the person approved — TC-70", () => {
  it("TC-70: two agents commenting on one task are each marked mcp under their own approved name, and a forged kind and provider in the tool's input change nothing", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await writeInitialSnapshot(booted, parent.token)

      const claudeCodeId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const claudeCode = await connectAgent(booted, parent.token, {clientId: claudeCodeId, redirectUri: "http://localhost:5555/callback"})

      const codexId = registerClientDocument(docs, "/codex.json", codexDocument)
      await openAgentWindowOver(booted, parent.token)
      const codex = await connectAgent(booted, parent.token, {clientId: codexId, redirectUri: "http://localhost:5555/callback"})

      const saveTask = statelessRequest(1, "tools/call", {name: "save_task", arguments: {content: "Ship the thing"}}, "save_task")
      const saveTaskRes = await postMcp(booted, claudeCode.accessToken, saveTask.body, saveTask.headers)
      const savedTask = JSON.parse(((await saveTaskRes.json()) as any).result.content[0].text).task as {id: string}

      const honest = statelessRequest(
        2,
        "tools/call",
        {name: "save_comment", arguments: {taskId: savedTask.id, content: "Review is blocking this"}},
        "save_comment",
      )
      const honestRes = await postMcp(booted, claudeCode.accessToken, honest.body, honest.headers)
      expect(honestRes.status).toBe(200)
      const honestComment = JSON.parse(((await honestRes.json()) as any).result.content[0].text).comment
      expect(honestComment.kind).toBe("mcp")
      expect(honestComment.provider).toBe("Claude Code")

      const forged = statelessRequest(
        3,
        "tools/call",
        {name: "save_comment", arguments: {taskId: savedTask.id, content: "not really a person", kind: "manual", provider: "Claude Code"}},
        "save_comment",
      )
      const forgedRes = await postMcp(booted, codex.accessToken, forged.body, forged.headers)
      expect(forgedRes.status).toBe(200)
      const forgedComment = JSON.parse(((await forgedRes.json()) as any).result.content[0].text).comment
      expect(forgedComment.kind).toBe("mcp")
      expect(forgedComment.provider).toBe("Codex")

      const read = statelessRequest(4, "tools/call", {name: "get_task", arguments: {id: savedTask.id}}, "get_task")
      const readRes = await postMcp(booted, claudeCode.accessToken, read.body, read.headers)
      const readTask = JSON.parse(((await readRes.json()) as any).result.content[0].text)
      expect(readTask.comments.map((c: {kind: string; provider: string}) => [c.kind, c.provider])).toEqual([
        ["mcp", "Claude Code"],
        ["mcp", "Codex"],
      ])

      const remove = statelessRequest(5, "tools/call", {name: "delete_comment", arguments: {id: forgedComment.id}}, "delete_comment")
      const removeRes = await postMcp(booted, codex.accessToken, remove.body, remove.headers)
      expect(removeRes.status).toBe(200)

      const readAgain = statelessRequest(6, "tools/call", {name: "get_task", arguments: {id: savedTask.id}}, "get_task")
      const readAgainRes = await postMcp(booted, claudeCode.accessToken, readAgain.body, readAgain.headers)
      const readAgainTask = JSON.parse(((await readAgainRes.json()) as any).result.content[0].text)
      expect(readAgainTask.comments.map((c: {id: string}) => c.id)).toEqual([honestComment.id])
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})
