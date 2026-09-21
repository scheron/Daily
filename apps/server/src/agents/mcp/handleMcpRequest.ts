import {isNumber, isObject, isString} from "@daily/std"

import pkg from "../../../package.json"
import {callMcpTool, listMcpTools} from "./mcpTools"

import type {AgentWorkspaceDeps} from "../AgentWorkspace"
import type {McpCaller} from "./mcpTools"

export type McpRequestHeaders = {protocolVersion: string | null; method: string | null; name: string | null}
export type McpReply = {status: 202; body: null} | {status: 200 | 400 | 404 | 500; body: object}

type McpGeneration = "2025-11-25" | "2026-07-28"
type JsonRpcRequest = {id: unknown; method: string; params: unknown}
type McpRequestClass =
  | {kind: "parseError"}
  | {kind: "invalidRequest"; id: string | number | null}
  | {kind: "notificationOrResponse"}
  | {kind: "request"; generation: McpGeneration; request: JsonRpcRequest}
type JsonRpcError = {code: -32700 | -32600 | -32601 | -32602 | -32603 | -32020 | -32022; message: string; data?: unknown}
type JsonRpcOutcome = {result: object} | {error: JsonRpcError}

const STATELESS_VERSIONS = ["2026-07-28"]
const EARLIER_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"]
const SUPPORTED_VERSIONS = [...STATELESS_VERSIONS, ...EARLIER_VERSIONS]
const PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion"
const SERVER_INFO = {name: "daily", title: "Daily", version: pkg.version}

/**
 * Answers one MCP POST body as `caller`'s Mac, in the protocol generation the request itself selects:
 * the 2026-07-28 stateless one or the 2025-11-25 `initialize` one. Knows nothing of tokens, `Origin`,
 * the body's size or HTTP — `headers` are the raw `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name`
 * values, `null` when absent. Never rejects; a `202` is sent with no body.
 */
export async function handleMcpRequest(deps: AgentWorkspaceDeps, caller: McpCaller, body: string, headers: McpRequestHeaders): Promise<McpReply> {
  const classified = classifyMcpRequest(body, headers)

  switch (classified.kind) {
    case "parseError":
      return {status: 400, body: errorEnvelope(null, {code: -32700, message: "Parse error"})}
    case "invalidRequest":
      return {status: 400, body: errorEnvelope(classified.id, {code: -32600, message: "Invalid Request"})}
    case "notificationOrResponse":
      return {status: 202, body: null}
  }

  const {generation, request} = classified
  let outcome: JsonRpcOutcome
  try {
    outcome =
      generation === "2026-07-28"
        ? await answerStatelessGeneration(deps, caller, request, headers)
        : await answerEarlierGeneration(deps, caller, request, headers)
  } catch (error) {
    console.error(error)
    outcome = {error: {code: -32603, message: "Internal error"}}
  }

  if ("result" in outcome) return {status: 200, body: {jsonrpc: "2.0", id: request.id, result: outcome.result}}
  return {status: errorStatus(generation, outcome.error.code), body: errorEnvelope(request.id, outcome.error)}
}

function classifyMcpRequest(body: string, headers: McpRequestHeaders): McpRequestClass {
  let message: unknown
  try {
    message = JSON.parse(body)
  } catch {
    return {kind: "parseError"}
  }

  if (Array.isArray(message)) return {kind: "invalidRequest", id: null}
  if (!isObject<Record<string, unknown>>(message)) return {kind: "invalidRequest", id: null}

  const {id, method} = message
  const isResponse = message.result !== undefined || message.error !== undefined
  if (message.jsonrpc !== "2.0" || (!isString(method) && !isResponse)) {
    return {kind: "invalidRequest", id: isString(id) || isNumber(id) ? id : null}
  }

  if (!isString(method) || id === undefined) return {kind: "notificationOrResponse"}

  const request = {id, method, params: message.params}
  if (method === "initialize") return {kind: "request", generation: "2025-11-25", request}

  if (readMeta(request.params)?.[PROTOCOL_VERSION_META] !== undefined || STATELESS_VERSIONS.includes(headers.protocolVersion ?? "")) {
    return {kind: "request", generation: "2026-07-28", request}
  }

  return {kind: "request", generation: "2025-11-25", request}
}

async function answerEarlierGeneration(
  deps: AgentWorkspaceDeps,
  caller: McpCaller,
  request: JsonRpcRequest,
  headers: McpRequestHeaders,
): Promise<JsonRpcOutcome> {
  const {protocolVersion} = headers
  if (request.method !== "initialize" && protocolVersion !== null && !EARLIER_VERSIONS.includes(protocolVersion)) {
    return {error: unsupportedVersion(protocolVersion)}
  }

  switch (request.method) {
    case "initialize":
      return initialize(request.params)
    case "ping":
      return {result: {}}
    case "tools/list":
      return {result: {tools: listMcpTools()}}
    case "tools/call": {
      const outcome = await callMcpTool(deps, caller, request.params)
      return outcome.ok ? {result: outcome.result} : {error: outcome.error}
    }
    default:
      return {error: methodNotFound(request.method)}
  }
}

async function answerStatelessGeneration(
  deps: AgentWorkspaceDeps,
  caller: McpCaller,
  request: JsonRpcRequest,
  headers: McpRequestHeaders,
): Promise<JsonRpcOutcome> {
  const meta = readMeta(request.params)
  const version = meta?.[PROTOCOL_VERSION_META]
  if (!isString(version) || !isObject(meta?.["io.modelcontextprotocol/clientCapabilities"])) {
    return {error: {code: -32602, message: `_meta needs a string ${PROTOCOL_VERSION_META} and an object io.modelcontextprotocol/clientCapabilities`}}
  }
  if (!STATELESS_VERSIONS.includes(version)) return {error: unsupportedVersion(version)}

  if (!headerMatches(headers.protocolVersion, version)) return {error: headerMismatch("MCP-Protocol-Version", "the protocol version in _meta")}
  if (!headerMatches(headers.method, request.method)) return {error: headerMismatch("Mcp-Method", "the request's method")}
  if (request.method === "tools/call" && !headerMatches(headers.name, readToolName(request.params))) {
    return {error: headerMismatch("Mcp-Name", "the tool's name")}
  }

  switch (request.method) {
    case "server/discover":
      return {result: completeResult({supportedVersions: SUPPORTED_VERSIONS, capabilities: {tools: {}}, ttlMs: 300000, cacheScope: "public"})}
    case "tools/list":
      return {result: completeResult({tools: listMcpTools(), ttlMs: 300000, cacheScope: "public"})}
    case "tools/call": {
      const outcome = await callMcpTool(deps, caller, request.params)
      return outcome.ok ? {result: completeResult(outcome.result)} : {error: outcome.error}
    }
    default:
      return {error: methodNotFound(request.method)}
  }
}

function initialize(params: unknown): JsonRpcOutcome {
  const requested = isObject<Record<string, unknown>>(params) ? params.protocolVersion : undefined
  if (!isString(requested)) return {error: {code: -32602, message: "initialize needs a protocolVersion string"}}

  const protocolVersion = EARLIER_VERSIONS.includes(requested) ? requested : "2025-11-25"
  return {result: {protocolVersion, capabilities: {tools: {}}, serverInfo: SERVER_INFO}}
}

function unsupportedVersion(requested: string): JsonRpcError {
  return {code: -32022, message: `Unsupported protocol version: ${requested}`, data: {supported: SUPPORTED_VERSIONS, requested}}
}

function methodNotFound(method: string): JsonRpcError {
  return {code: -32601, message: `Method not found: ${method}`}
}

function headerMismatch(header: string, expected: string): JsonRpcError {
  return {code: -32020, message: `The ${header} header does not match ${expected}`}
}

function completeResult(result: object): object {
  return {resultType: "complete", ...result, _meta: {"io.modelcontextprotocol/serverInfo": SERVER_INFO}}
}

function headerMatches(value: string | null, expected: unknown): boolean {
  if (value === null) return false

  const decoded = decodeHeaderValue(value)
  return decoded !== null && decoded === expected
}

function decodeHeaderValue(value: string): string | null {
  if (!/^[\t\x20-\x7e]*$/.test(value)) return null

  const wrapped = /^=\?base64\?(.*)\?=$/.exec(value)
  if (!wrapped) return value

  const [, encoded] = wrapped
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null

  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(Buffer.from(encoded, "base64"))
  } catch {
    return null
  }
}

function readToolName(params: unknown): unknown {
  return isObject<Record<string, unknown>>(params) ? params.name : undefined
}

function readMeta(params: unknown): Record<string, unknown> | null {
  if (!isObject<Record<string, unknown>>(params) || !isObject<Record<string, unknown>>(params._meta)) return null
  return params._meta
}

function errorStatus(generation: McpGeneration, code: JsonRpcError["code"]): 200 | 400 | 404 | 500 {
  if (generation === "2025-11-25") return code === -32022 ? 400 : 200
  if (code === -32601) return 404
  return code === -32603 ? 500 : 400
}

function errorEnvelope(id: unknown, error: JsonRpcError): object {
  return {jsonrpc: "2.0", id, error}
}
