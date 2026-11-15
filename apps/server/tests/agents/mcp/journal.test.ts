import {readdirSync, readFileSync, writeFileSync} from "node:fs"
import {open} from "node:fs/promises"
import {join} from "node:path"
import {describe, expect, it, vi} from "vitest"

import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {readRevision} from "../../../src/snapshot/SnapshotStore"
import {rawSnapshotDocument} from "../helpers"
import {
  bootAgentServer,
  claimParent,
  claudeCodeDocument,
  connectAgent,
  openAgentWindowOver,
  registerClientDocument,
  startClientDocumentServer,
} from "../oauth/harness"

import type {RequestLogView} from "@daily/protocol"
import type * as FsPromises from "node:fs/promises"
import type {BootedAgentServer} from "../oauth/harness"

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FsPromises>()
  return {...fs, open: vi.fn(fs.open)}
})

describe("MCP lifecycle journal", () => {
  it("persists a sanitized start before submission and correlates the terminal result", async () => {
    const search = "private search phrase"
    let recordsAtSubmission: unknown[] = []
    const booted = await bootAgentServer(
      {},
      {
        searchRunner: {
          submit() {
            recordsAtSubmission = readRecords(booted)
            return {outcome: Promise.resolve({ok: true, text: '{"tasks":[]}', timing: {queueMs: 12, executionMs: 31}}), cancel() {}}
          },
          async close() {},
        },
      },
    )

    try {
      const {agentToken} = await prepareAgent(booted)
      const forbidden = await postSearch(booted, "invalid-token-marker", search)
      expect(forbidden.status).toBe(401)
      const result = await postSearch(booted, agentToken, search)
      expect(result.status).toBe(200)
      expect(recordsAtSubmission).toEqual([
        {event: "start", id: expect.stringMatching(/^[\da-f-]{36}$/), at: expect.any(String), tool: "list_tasks", searchLength: 21},
      ])

      await vi.waitFor(() => {
        const [start, end, unexpected] = readRecords(booted)
        expect(end).toEqual({
          event: "end",
          id: start.id,
          at: expect.any(String),
          code: "OK",
          elapsedMs: expect.any(Number),
          queueMs: 12,
          executionMs: 31,
        })
        expect(unexpected).toBeUndefined()
        expect(JSON.stringify([start, end])).not.toMatch(/private search phrase|client-request-marker|invalid-token-marker/)
      })
    } finally {
      await booted.close()
    }
  })

  it("warns once without raw I/O details and continues serving MCP and sync when the volume journal is unwritable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const booted = await bootAgentServer(
      {},
      {
        searchRunner: {
          submit() {
            return {outcome: Promise.resolve({ok: true, text: '{"tasks":[]}'}), cancel() {}}
          },
          async close() {},
        },
      },
    )

    try {
      writeFileSync(join(booted.dataDir, "mcp-journal"), "cannot use this file as a directory")
      const {agentToken, syncToken} = await prepareAgent(booted)
      for (const search of ["private first phrase", "private second phrase"]) {
        const result = await postSearch(booted, agentToken, search)
        expect((await result.json()).result.content).toEqual([{type: "text", text: '{"tasks":[]}'}])
      }
      const sync = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${syncToken}`}})
      expect(sync.status).toBe(200)
      expect(warn.mock.calls).toEqual([["MCP journal degraded"]])
    } finally {
      await booted.close()
      warn.mockRestore()
    }
  })

  it("records legacy cancellation while a start is still waiting on disk", async () => {
    const submit = vi.fn(() => ({outcome: Promise.resolve({ok: true as const, text: '{"tasks":[]}'}), cancel() {}}))
    const booted = await bootAgentServer({}, {searchRunner: {submit, async close() {}}})
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const fs = await vi.importActual<typeof FsPromises>("node:fs/promises")

    try {
      const {agentToken} = await prepareAgent(booted)
      const initialized = await postMcp(booted, agentToken, {
        jsonrpc: "2.0",
        id: "initialize",
        method: "initialize",
        params: {protocolVersion: "2025-11-25"},
      })
      const session = initialized.headers.get("mcp-session-id")
      expect(session).toBeTruthy()
      vi.mocked(open).mockImplementationOnce(async (...args) => {
        entered.resolve()
        await release.promise
        return fs.open(...args)
      })
      const search = postSearch(booted, agentToken, "private search phrase", session ?? "")
      await entered.promise
      const cancel = await postMcp(
        booted,
        agentToken,
        {
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: {requestId: "client-request-marker"},
        },
        session ?? "",
      )
      release.resolve()

      expect(cancel.status).toBe(202)
      const response = await (await search).json()
      expect(JSON.parse(response.result.content[0].text).error.code).toBe("SEARCH_CANCELLED")
      expect(submit).not.toHaveBeenCalled()
      await vi.waitFor(() => {
        const [start, end] = readRecords(booted)
        expect(end).toMatchObject({event: "end", id: start.id, code: "SEARCH_CANCELLED"})
      })
    } finally {
      release.resolve()
      await booted.close()
    }
  })

  it("skips a valid save when its HTTP client disconnects while the start waits on disk", async () => {
    const booted = await bootAgentServer()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const client = new AbortController()
    const fs = await vi.importActual<typeof FsPromises>("node:fs/promises")
    const message = {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "save_task", arguments: {content: "Pending save"}}}

    try {
      const {agentToken, syncToken} = await prepareAgent(booted)
      const headers = {authorization: `Bearer ${syncToken}`, "content-type": "application/json"}
      const snapshot = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers,
        body: JSON.stringify({expectedRevision: null, snapshot: rawSnapshotDocument()}),
      })
      expect(snapshot.status).toBe(200)
      vi.mocked(open).mockImplementationOnce(async (...args) => {
        entered.resolve()
        await release.promise
        return fs.open(...args)
      })

      const disconnected = expect(postMcp(booted, agentToken, message, null, client.signal)).rejects.toMatchObject({name: "AbortError"})
      await entered.promise
      client.abort()
      await disconnected
      await vi.waitFor(
        async () => {
          const response = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.logs}`, {headers})
          const log = (await response.json()) as {data: RequestLogView}
          expect(log.data.entries).toContainEqual(expect.objectContaining({path: AGENT_ENDPOINT_PATH, status: null}))
        },
        {interval: 5},
      )
      release.resolve()

      await vi.waitFor(() => {
        const [start, end] = readRecords(booted)
        expect(end).toMatchObject({event: "end", id: start.id})
        expect(readRevision(booted.store)).toBe("1")
        expect(end).toMatchObject({code: "REQUEST_CANCELLED"})
        expect(end).not.toHaveProperty("executionMs")
      })

      const saved = await postMcp(booted, agentToken, message)
      const {result} = await saved.json()
      expect(JSON.parse(result.content[0].text).task.content).toBe("Pending save")
      expect(readRevision(booted.store)).toBe("2")
      await vi.waitFor(() => expect(readRecords(booted)).toHaveLength(4))
    } finally {
      client.abort()
      release.resolve()
      await booted.close()
    }
  })
})

async function prepareAgent(booted: BootedAgentServer): Promise<{agentToken: string; syncToken: string}> {
  const docs = await startClientDocumentServer()
  try {
    const parent = await claimParent(booted)
    const clientId = registerClientDocument(docs, "/journal-client.json", claudeCodeDocument)
    await openAgentWindowOver(booted, parent.token)
    const agent = await connectAgent(booted, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})
    return {agentToken: agent.accessToken, syncToken: parent.token}
  } finally {
    await docs.close()
  }
}

function postSearch(booted: BootedAgentServer, token: string, search: string, session: string | null = null): Promise<Response> {
  return postMcp(
    booted,
    token,
    {jsonrpc: "2.0", id: "client-request-marker", method: "tools/call", params: {name: "list_tasks", arguments: {search}}},
    session,
  )
}

function postMcp(
  booted: BootedAgentServer,
  token: string,
  message: object,
  session: string | null = null,
  signal: AbortSignal | null = null,
): Promise<Response> {
  return fetch(`${booted.baseUrl}${AGENT_ENDPOINT_PATH}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json", ...(session && {"mcp-session-id": session})},
    body: JSON.stringify(message),
    signal,
  })
}

function readRecords(booted: BootedAgentServer): {id: string}[] {
  const dir = join(booted.dataDir, "mcp-journal")
  if (!readdirSync(booted.dataDir).includes("mcp-journal")) return []
  return readdirSync(dir).flatMap((file) =>
    readFileSync(join(dir, file), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  )
}
