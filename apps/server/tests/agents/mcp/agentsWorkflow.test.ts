import {expect, it} from "vitest"

import {KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {exerciseStatusContract} from "../../../../../packages/tools/tests/helpers/statusContract"
import {
  bootAgentServer,
  claimParent,
  claudeCodeDocument,
  connectAgent,
  openAgentWindowOver,
  registerClientDocument,
  startClientDocumentServer,
} from "../oauth/harness"

it("OAuth-connected MCP tools preserve six exact statuses, atomic writes and approved authorship", async () => {
  const server = await bootAgentServer()
  const docs = await startClientDocumentServer()
  try {
    const parent = await claimParent(server)
    const seed = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({
        expectedRevision: null,
        snapshot: {
          version: KNOWN_SNAPSHOT_VERSION,
          meta: {updatedAt: new Date().toISOString(), hash: "synthetic"},
          docs: {tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], files: [], events: []},
        },
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
    )
  } finally {
    await docs.close()
    await server.close()
  }
})
