import {isObject} from "@daily/std"
import {findTool, ToolErrorCode, TOOLS} from "@daily/tools"

import {runAgentTool} from "../runAgentTool"
import {isSearchedRead} from "../search/SearchRunner"

import type {ToolAttachment, ToolInputSchema} from "@daily/tools"
import type {AgentIdentity, AgentWorkspaceDeps} from "../AgentWorkspace"
import type {AgentToolCall, AgentToolOutcome} from "../runAgentTool"
import type {SearchOutcome} from "../search/SearchRunner"
import type {McpJournal} from "./McpJournal"

/** The agent behind one MCP request: its Mac, that Mac's time zone, and the name it was approved under. */
export type McpCaller = {deviceId: string; timeZone: string | null; name: string}

export type McpToolDescription = {
  name: string
  description: string
  inputSchema: ToolInputSchema
  annotations: {readOnlyHint: boolean; destructiveHint: boolean}
}

export type McpContent = {type: "text"; text: string} | {type: "image"; data: string; mimeType: string}
export type McpToolResult = {content: McpContent[]; isError?: true}
export type McpToolCallOutcome = {ok: true; result: McpToolResult} | {ok: false; error: {code: -32602; message: string}}
export type McpToolDeps = AgentWorkspaceDeps & {
  executeTool?: (agent: AgentIdentity, call: AgentToolCall) => Promise<AgentToolOutcome | SearchOutcome>
  journal?: Pick<McpJournal, "begin">
}

/**
 * Every shared tool as MCP's `tools/list` describes it: `TOOLS`' order, name, description
 * and input schema, each annotated with `readOnlyHint` and `destructiveHint` from the tool's mode.
 */
export function listMcpTools(): McpToolDescription[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {readOnlyHint: tool.mode === "read", destructiveHint: tool.mode === "delete"},
  }))
}

/**
 * Runs one MCP `tools/call` as `caller`'s Mac, through `runAgentTool`, and renders the answer in
 * MCP's content shapes. A malformed call or an unknown tool answers a JSON-RPC
 * error, and a tool's own refusal answers an `isError` result a model can read and correct.
 */
export async function callMcpTool(deps: McpToolDeps, caller: McpCaller, params: unknown): Promise<McpToolCallOutcome> {
  if (!isObject<Record<string, unknown>>(params) || typeof params.name !== "string") {
    return {ok: false, error: {code: -32602, message: "tools/call needs a tool name"}}
  }

  const tool = findTool(params.name)
  if (!tool) return {ok: false, error: {code: -32602, message: `Unknown tool: ${params.name}`}}

  const {name} = tool
  const rawArguments = params.arguments
  const input = isObject<Record<string, unknown>>(rawArguments) ? rawArguments : null
  const searchLength = name === "list_tasks" && typeof input?.search === "string" ? input.search.length : null
  const finish = deps.journal ? await deps.journal.begin(name, searchLength) : null

  let code: ToolErrorCode | "OK" = ToolErrorCode.INTERNAL
  let timing: {queueMs?: number; executionMs?: number} | null = null
  try {
    if (rawArguments !== undefined && rawArguments !== null && input === null) {
      code = ToolErrorCode.INVALID_INPUT
      return {ok: false, error: {code: -32602, message: `Invalid arguments for tool ${name}: arguments must be an object`}}
    }

    if (caller.timeZone === null) {
      const message =
        "This agent's Mac has not told the server its time zone yet, so the server cannot tell which day it is there. Open Daily on that Mac and let it sync once, then try again."
      code = ToolErrorCode.MAC_TIME_ZONE_UNKNOWN
      return {ok: true, result: errorResult(code, message)}
    }

    const agent = {deviceId: caller.deviceId, timeZone: caller.timeZone, name: caller.name}
    const call = {name, input: input ?? {}}
    const started = performance.now()
    const outcome = deps.executeTool ? await deps.executeTool(agent, call) : await runAgentTool(deps, agent, call)
    if ("timing" in outcome && outcome.timing) timing = outcome.timing
    else if ((outcome.ok || outcome.error.code !== ToolErrorCode.REQUEST_CANCELLED) && !isSearchedRead(call)) {
      timing = {executionMs: performance.now() - started}
    }
    const result = renderToolOutcome(name, outcome)
    code = outcome.ok ? "OK" : outcome.error.code
    return {ok: true, result}
  } finally {
    finish?.(code, timing ?? {})
  }
}

function renderToolOutcome(name: string, outcome: AgentToolOutcome | SearchOutcome): McpToolResult {
  if (!outcome.ok) return errorResult(outcome.error.code, outcome.error.message)
  if ("text" in outcome) return {content: [{type: "text", text: outcome.text}]}

  if (name === "get_attachment") {
    const attachment = outcome.data as ToolAttachment
    return {content: [{type: "image", data: attachment.dataBase64, mimeType: attachment.mimeType}]}
  }

  return {content: [{type: "text", text: JSON.stringify(outcome.data)}]}
}

function errorResult(code: ToolErrorCode, message: string): McpToolResult {
  return {content: [{type: "text", text: JSON.stringify({error: {code, message}})}], isError: true}
}
