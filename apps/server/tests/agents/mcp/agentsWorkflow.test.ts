import {expect, it} from "vitest"

import {WorkStorage} from "@daily/core/storage/WorkStorage"
import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {exerciseStatusContract} from "../../../../../packages/tools/tests/helpers/statusContract"
import {readSnapshot} from "../../../src/snapshot/SnapshotStore"
import {openMacCore, rawSnapshotDocument, writeMacSnapshot} from "../helpers"
import {
  bootAgentServer,
  claimParent,
  claudeCodeDocument,
  connectAgent,
  openAgentWindowOver,
  registerClientDocument,
  startClientDocumentServer,
} from "../oauth/harness"

import type {SnapshotDocs} from "@daily/protocol"

it("OAuth-connected MCP tools enforce the shared workflow, atomic writes and approved authorship", async () => {
  const server = await bootAgentServer()
  const docs = await startClientDocumentServer()
  try {
    const parent = await claimParent(server)
    const seed = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({
        expectedRevision: null,
        snapshot: rawSnapshotDocument({meta: {updatedAt: new Date().toISOString(), hash: "synthetic"}}),
      }),
    })
    expect(seed.status).toBe(200)
    const clientId = registerClientDocument(docs, "/synthetic-client.json", claudeCodeDocument)
    await openAgentWindowOver(server, parent.token)
    const connected = await connectAgent(server, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})
    let requestId = 0
    await exerciseStatusContract(
      async (name, input) => {
        const response = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
          method: "POST",
          headers: {authorization: `Bearer ${connected.accessToken}`, "content-type": "application/json", "mcp-protocol-version": "2025-06-18"},
          body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: {name, arguments: input}}),
        })
        expect(response.status).toBe(200)
        const json = (await response.json()) as {result: {isError?: boolean; content: {text: string}[]}}
        const data = JSON.parse(json.result.content[0].text)
        if (json.result.isError) throw new Error(data.error.message)
        return data
      },
      {kind: "mcp", provider: "Claude Code"},
      async (request) => {
        const stored = readSnapshot(server.store)!
        const mac = openMacCore()
        try {
          await mac.core.localAdapter.upsertDocs(stored.document.docs as SnapshotDocs)
          const storage = new WorkStorage(mac.core, mac.db, () => {}, {
            runtimeId: "trusted-review",
            scheduledNow: () => ({date: "2040-01-01", time: "00:00:00", timezone: "UTC"}),
          })
          await storage.resolveTaskWorkflowProposal(request)
          await writeMacSnapshot(server.store, mac, stored.revision, parent.deviceId)
        } finally {
          mac.close()
        }
      },
    )
  } finally {
    await docs.close()
    await server.close()
  }
})
