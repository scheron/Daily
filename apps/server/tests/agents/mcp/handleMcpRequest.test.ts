import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {handleMcpRequest} from "../../../src/agents/mcp/handleMcpRequest"
import {bindAgent, bindDevice, seedAgentStore} from "../helpers"

import type {McpRequestHeaders} from "../../../src/agents/mcp/handleMcpRequest"
import type {McpCaller} from "../../../src/agents/mcp/mcpTools"
import type {SeededStore} from "../helpers"

const SUPPORTED_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]
const STATELESS_META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}
const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const serverVersion = (JSON.parse(readFileSync(join(serverDir, "package.json"), "utf-8")) as {version: string}).version

function noHeaders(): McpRequestHeaders {
  return {protocolVersion: null, method: null, name: null}
}

describe("handleMcpRequest", () => {
  let seeded: SeededStore
  let caller: McpCaller

  beforeEach(async () => {
    seeded = await seedAgentStore()
    const agent = bindAgent(seeded.store, "Agent Mac", "UTC")
    caller = {deviceId: agent.deviceId, timeZone: agent.timeZone}
  })

  afterEach(() => {
    seeded.close()
  })

  describe("a malformed message is refused before dispatch — TC-21", () => {
    it("TC-21: unparsable JSON, a batch array holding even one well-formed request, and an object missing jsonrpc 2.0's own shape are refused before dispatch", async () => {
      const parseError = await handleMcpRequest({store: seeded.store}, caller, "{not json", noHeaders())
      expect(parseError.status).toBe(400)
      expect(parseError.body).toMatchObject({jsonrpc: "2.0", id: null, error: {code: -32700}})

      const emptyArray = await handleMcpRequest({store: seeded.store}, caller, "[]", noHeaders())
      expect(emptyArray.status).toBe(400)
      expect(emptyArray.body).toMatchObject({jsonrpc: "2.0", id: null, error: {code: -32600}})

      const batchOfOne = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify([{jsonrpc: "2.0", id: 1, method: "ping"}]), noHeaders())
      expect(batchOfOne.status).toBe(400)
      expect(batchOfOne.body).toMatchObject({jsonrpc: "2.0", id: null, error: {code: -32600}})

      const wrongVersion = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "1.0", id: 7, method: "ping"}), noHeaders())
      expect(wrongVersion.status).toBe(400)
      expect(wrongVersion.body).toMatchObject({jsonrpc: "2.0", id: 7, error: {code: -32600}})

      const noMethod = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 8}), noHeaders())
      expect(noMethod.status).toBe(400)
      expect(noMethod.body).toMatchObject({jsonrpc: "2.0", id: 8, error: {code: -32600}})
    })
  })

  describe("a message with no id is accepted with no body — TC-22", () => {
    it("TC-22: a notification with no id — including a client's own response and one carrying 2026-07-28 _meta and headers — is 202 with no body", async () => {
      const initialized = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}),
        noHeaders(),
      )
      expect(initialized).toEqual({status: 202, body: null})

      const clientResponse = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 5, result: {}}), noHeaders())
      expect(clientResponse).toEqual({status: 202, body: null})

      const statelessNotification = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "notifications/initialized", name: null},
      )
      expect(statelessNotification).toEqual({status: 202, body: null})
    })
  })

  describe("initialize always answers in the 2025-11-25 generation — TC-23", () => {
    it("TC-23: initialize always answers the 2025-11-25 shape, echoing a recognised protocolVersion and defaulting an unrecognised one, even carrying 2026-07-28 _meta and its header", async () => {
      const echoed = ["2025-06-18", "2025-11-25", "2025-03-26"]
      for (const [index, version] of echoed.entries()) {
        const reply = await handleMcpRequest(
          {store: seeded.store},
          caller,
          JSON.stringify({
            jsonrpc: "2.0",
            id: index,
            method: "initialize",
            params: {protocolVersion: version, capabilities: {}, clientInfo: {name: "x", version: "0"}},
          }),
          noHeaders(),
        )
        expect(reply.status).toBe(200)
        expect(reply.body).toEqual({
          jsonrpc: "2.0",
          id: index,
          result: {protocolVersion: version, capabilities: {tools: {}}, serverInfo: {name: "daily", title: "Daily", version: serverVersion}},
        })
        expect((reply.body as Record<string, unknown>).result).not.toHaveProperty("resultType")
      }

      for (const version of ["2024-11-05", "2026-07-28"]) {
        const reply = await handleMcpRequest(
          {store: seeded.store},
          caller,
          JSON.stringify({
            jsonrpc: "2.0",
            id: "u",
            method: "initialize",
            params: {protocolVersion: version, capabilities: {}, clientInfo: {name: "x", version: "0"}},
          }),
          noHeaders(),
        )
        expect(reply.status).toBe(200)
        expect((reply.body as {result: {protocolVersion: string}}).result.protocolVersion).toBe("2025-11-25")
      }

      const ambiguous = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({
          jsonrpc: "2.0",
          id: "amb",
          method: "initialize",
          params: {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "x", version: "0"}, _meta: STATELESS_META},
        }),
        {protocolVersion: "2026-07-28", method: "initialize", name: null},
      )
      expect(ambiguous.status).toBe(200)
      expect(ambiguous.body).toEqual({
        jsonrpc: "2.0",
        id: "amb",
        result: {protocolVersion: "2025-11-25", capabilities: {tools: {}}, serverInfo: {name: "daily", title: "Daily", version: serverVersion}},
      })
    })
  })

  describe("the 2025-11-25 generation — TC-24", () => {
    it("TC-24: ping and a recognised tools/list header answer 200; an unrecognised header is 400 -32022; an unsupported method and an unknown tool call are both 200 with their own JSON-RPC error", async () => {
      const ping = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}), noHeaders())
      expect(ping).toEqual({status: 200, body: {jsonrpc: "2.0", id: 1, result: {}}})

      const list = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list"}), {
        protocolVersion: "2025-06-18",
        method: null,
        name: null,
      })
      expect(list.status).toBe(200)
      const listResult = (list.body as {result: Record<string, unknown>}).result
      expect((listResult.tools as unknown[]).length).toBe(11)
      expect(listResult).not.toHaveProperty("resultType")
      expect(listResult).not.toHaveProperty("ttlMs")
      expect(listResult).not.toHaveProperty("cacheScope")

      const badVersion = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 3, method: "tools/list"}), {
        protocolVersion: "2024-11-05",
        method: null,
        name: null,
      })
      expect(badVersion.status).toBe(400)
      expect(badVersion.body).toEqual({
        jsonrpc: "2.0",
        id: 3,
        error: {code: -32022, message: expect.any(String), data: {supported: SUPPORTED_VERSIONS, requested: "2024-11-05"}},
      })

      const unsupportedMethod = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 4, method: "resources/list"}),
        noHeaders(),
      )
      expect(unsupportedMethod.status).toBe(200)
      expect(unsupportedMethod.body).toMatchObject({jsonrpc: "2.0", id: 4, error: {code: -32601}})

      const unknownTool = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 5, method: "tools/call", params: {name: "drop_database"}}),
        noHeaders(),
      )
      expect(unknownTool.status).toBe(200)
      expect(unknownTool.body).toMatchObject({jsonrpc: "2.0", id: 5, error: {code: -32602}})
    })
  })

  describe("the 2026-07-28 generation — TC-25", () => {
    it("TC-25: server/discover, tools/list and tools/call each answer the stateless envelope with resultType, ttlMs, cacheScope and _meta as the revision requires", async () => {
      const discover = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 1, method: "server/discover", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "server/discover", name: null},
      )
      expect(discover).toEqual({
        status: 200,
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            resultType: "complete",
            supportedVersions: SUPPORTED_VERSIONS,
            capabilities: {tools: {}},
            ttlMs: 300000,
            cacheScope: "public",
            _meta: {"io.modelcontextprotocol/serverInfo": {name: "daily", title: "Daily", version: serverVersion}},
          },
        },
      })

      const list = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/list", name: null},
      )
      expect(list.status).toBe(200)
      const listResult = (list.body as {result: Record<string, unknown>}).result
      expect(listResult.resultType).toBe("complete")
      expect((listResult.tools as unknown[]).length).toBe(11)
      expect(listResult.ttlMs).toBe(300000)
      expect(listResult.cacheScope).toBe("public")
      expect(listResult._meta).toEqual({"io.modelcontextprotocol/serverInfo": {name: "daily", title: "Daily", version: serverVersion}})

      const call = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 3, method: "tools/call", params: {name: "list_projects", _meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/call", name: "list_projects"},
      )
      expect(call.status).toBe(200)
      const callResult = (call.body as {result: Record<string, unknown>}).result
      expect(callResult.resultType).toBe("complete")
      expect(callResult.content).toBeDefined()
      expect(callResult._meta).toEqual({"io.modelcontextprotocol/serverInfo": {name: "daily", title: "Daily", version: serverVersion}})
    })
  })

  describe("the 2026-07-28 generation's _meta and version — TC-26", () => {
    it("TC-26: the header alone with no _meta, _meta lacking clientCapabilities, and an unrecognised _meta version are each refused with no resultType anywhere", async () => {
      const noMeta = await handleMcpRequest({store: seeded.store}, caller, JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}), {
        protocolVersion: "2026-07-28",
        method: "tools/list",
        name: null,
      })
      expect(noMeta.status).toBe(400)
      expect(noMeta.body).toMatchObject({jsonrpc: "2.0", id: 1, error: {code: -32602}})
      expect(noMeta.body).not.toHaveProperty("resultType")

      const noCapabilities = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list", params: {_meta: {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}}),
        {protocolVersion: "2026-07-28", method: "tools/list", name: null},
      )
      expect(noCapabilities.status).toBe(400)
      expect(noCapabilities.body).toMatchObject({jsonrpc: "2.0", id: 2, error: {code: -32602}})
      expect(noCapabilities.body).not.toHaveProperty("resultType")

      const unrecognisedVersion = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/list",
          params: {_meta: {"io.modelcontextprotocol/protocolVersion": "2027-01-01", "io.modelcontextprotocol/clientCapabilities": {}}},
        }),
        {protocolVersion: "2027-01-01", method: "tools/list", name: null},
      )
      expect(unrecognisedVersion.status).toBe(400)
      expect(unrecognisedVersion.body).toEqual({
        jsonrpc: "2.0",
        id: 3,
        error: {code: -32022, message: expect.any(String), data: {supported: SUPPORTED_VERSIONS, requested: "2027-01-01"}},
      })
      expect(unrecognisedVersion.body).not.toHaveProperty("resultType")
    })
  })

  describe("the 2026-07-28 generation's headers — TC-27", () => {
    it("TC-27: a mismatched or missing version header, a missing or mismatched Mcp-Method, and a missing, mismatched or malformed Mcp-Name are all -32020; a lowercase-Base64-wrapped Mcp-Name is accepted", async () => {
      const metaMismatchedHeader = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2025-11-25", method: "tools/list", name: null},
      )
      expect(metaMismatchedHeader.status).toBe(400)
      expect(metaMismatchedHeader.body).toMatchObject({jsonrpc: "2.0", id: 1, error: {code: -32020}})

      const noVersionHeader = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: null, method: "tools/list", name: null},
      )
      expect(noVersionHeader.status).toBe(400)
      expect(noVersionHeader.body).toMatchObject({jsonrpc: "2.0", id: 2, error: {code: -32020}})

      const noMethodHeader = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 3, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: null, name: null},
      )
      expect(noMethodHeader.status).toBe(400)
      expect(noMethodHeader.body).toMatchObject({jsonrpc: "2.0", id: 3, error: {code: -32020}})

      const mismatchedMethodHeader = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 4, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/call", name: null},
      )
      expect(mismatchedMethodHeader.status).toBe(400)
      expect(mismatchedMethodHeader.body).toMatchObject({jsonrpc: "2.0", id: 4, error: {code: -32020}})

      const callWithName = (nameHeader: string | null, id: number) =>
        handleMcpRequest(
          {store: seeded.store},
          caller,
          JSON.stringify({jsonrpc: "2.0", id, method: "tools/call", params: {name: "list_projects", _meta: STATELESS_META}}),
          {protocolVersion: "2026-07-28", method: "tools/call", name: nameHeader},
        )

      const noNameHeader = await callWithName(null, 5)
      expect(noNameHeader.status).toBe(400)
      expect(noNameHeader.body).toMatchObject({jsonrpc: "2.0", id: 5, error: {code: -32020}})

      const mismatchedNameHeader = await callWithName("list_tags", 6)
      expect(mismatchedNameHeader.status).toBe(400)
      expect(mismatchedNameHeader.body).toMatchObject({jsonrpc: "2.0", id: 6, error: {code: -32020}})

      const uppercaseBase64NameHeader = await callWithName("=?BASE64?bGlzdF9wcm9qZWN0cw==?=", 7)
      expect(uppercaseBase64NameHeader.status).toBe(400)
      expect(uppercaseBase64NameHeader.body).toMatchObject({jsonrpc: "2.0", id: 7, error: {code: -32020}})

      const nonAsciiNameHeader = await callWithName("liśt_projects", 8)
      expect(nonAsciiNameHeader.status).toBe(400)
      expect(nonAsciiNameHeader.body).toMatchObject({jsonrpc: "2.0", id: 8, error: {code: -32020}})

      const lowercaseBase64NameHeader = await callWithName("=?base64?bGlzdF9wcm9qZWN0cw==?=", 9)
      expect(lowercaseBase64NameHeader.status).toBe(200)
      const result = (lowercaseBase64NameHeader.body as {result: {content: unknown[]}}).result
      expect(result.content).toBeDefined()
    })
  })

  describe("the 2026-07-28 generation's methods — TC-28", () => {
    it("TC-28: ping and resources/list are 404 -32601, and an unknown tool call is 400 -32602", async () => {
      const ping = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "ping", name: null},
      )
      expect(ping.status).toBe(404)
      expect(ping.body).toMatchObject({jsonrpc: "2.0", id: 1, error: {code: -32601}})

      const resourcesList = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "resources/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "resources/list", name: null},
      )
      expect(resourcesList.status).toBe(404)
      expect(resourcesList.body).toMatchObject({jsonrpc: "2.0", id: 2, error: {code: -32601}})

      const dropDatabase = await handleMcpRequest(
        {store: seeded.store},
        caller,
        JSON.stringify({jsonrpc: "2.0", id: 3, method: "tools/call", params: {name: "drop_database", _meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/call", name: "drop_database"},
      )
      expect(dropDatabase.status).toBe(400)
      expect(dropDatabase.body).toMatchObject({jsonrpc: "2.0", id: 3, error: {code: -32602}})
    })
  })

  describe("both generations answer the same zoneless result — TC-29", () => {
    it("TC-29: tools/list still answers the eleven tools, and tools/call answers the MAC_TIME_ZONE_UNKNOWN result inside each generation's own envelope", async () => {
      const zonelessMessage =
        "This agent's Mac has not told the server its time zone yet, so the server cannot tell which day it is there. Open Daily on that Mac and let it sync once, then try again."
      const zonelessDeviceId = bindDevice(seeded.store, "Zoneless Mac")
      const zonelessCaller: McpCaller = {deviceId: zonelessDeviceId, timeZone: null}

      const legacyList = await handleMcpRequest(
        {store: seeded.store},
        zonelessCaller,
        JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
        noHeaders(),
      )
      expect((legacyList.body as {result: {tools: unknown[]}}).result.tools.length).toBe(11)

      const legacyCall = await handleMcpRequest(
        {store: seeded.store},
        zonelessCaller,
        JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "list_projects"}}),
        noHeaders(),
      )
      expect(legacyCall.status).toBe(200)
      const legacyResult = (legacyCall.body as {result: {content: {type: string; text: string}[]; isError?: boolean}}).result
      expect(legacyResult.isError).toBe(true)
      expect(JSON.parse(legacyResult.content[0].text)).toEqual({error: {code: "MAC_TIME_ZONE_UNKNOWN", message: zonelessMessage}})

      const statelessList = await handleMcpRequest(
        {store: seeded.store},
        zonelessCaller,
        JSON.stringify({jsonrpc: "2.0", id: 3, method: "tools/list", params: {_meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/list", name: null},
      )
      expect((statelessList.body as {result: {tools: unknown[]}}).result.tools.length).toBe(11)

      const statelessCall = await handleMcpRequest(
        {store: seeded.store},
        zonelessCaller,
        JSON.stringify({jsonrpc: "2.0", id: 4, method: "tools/call", params: {name: "list_projects", _meta: STATELESS_META}}),
        {protocolVersion: "2026-07-28", method: "tools/call", name: "list_projects"},
      )
      expect(statelessCall.status).toBe(200)
      const statelessResult = (statelessCall.body as {result: {content: {type: string; text: string}[]; isError?: boolean; resultType?: string}})
        .result
      expect(statelessResult.isError).toBe(true)
      expect(statelessResult.resultType).toBe("complete")
      expect(JSON.parse(statelessResult.content[0].text)).toEqual({error: {code: "MAC_TIME_ZONE_UNKNOWN", message: zonelessMessage}})
    })
  })

  describe("an unexpected throw while answering", () => {
    it("answers -32603 with the request's own id and logs the throw — 500 in the 2026-07-28 generation, 200 in the 2025-11-25 one", async () => {
      const failure = new Error("the caller could not be read")
      const failingCaller = {
        deviceId: caller.deviceId,
        get timeZone(): string | null {
          throw failure
        },
      }
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        const legacy = await handleMcpRequest(
          {store: seeded.store},
          failingCaller,
          JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "list_projects"}}),
          noHeaders(),
        )
        expect(legacy).toEqual({status: 200, body: {jsonrpc: "2.0", id: 1, error: {code: -32603, message: "Internal error"}}})

        const stateless = await handleMcpRequest(
          {store: seeded.store},
          failingCaller,
          JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "list_projects", _meta: STATELESS_META}}),
          {protocolVersion: "2026-07-28", method: "tools/call", name: "list_projects"},
        )
        expect(stateless).toEqual({status: 500, body: {jsonrpc: "2.0", id: 2, error: {code: -32603, message: "Internal error"}}})

        expect(consoleError).toHaveBeenCalledWith(failure)
      } finally {
        consoleError.mockRestore()
      }
    })
  })
})
