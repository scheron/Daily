import {isObject} from "@daily/std"
import {findTool, ToolErrorCode, TOOLS} from "@daily/tools"

import {runAgentTool} from "../runAgentTool"

import type {ToolAttachment, ToolInputSchema} from "@daily/tools"
import type {AgentWorkspaceDeps} from "../AgentWorkspace"
import type {AgentToolOutcome} from "../runAgentTool"

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
 * MCP's content shapes. Never rejects: a malformed call or an unknown tool answers a JSON-RPC
 * error, and a tool's own refusal answers an `isError` result a model can read and correct.
 */
export async function callMcpTool(deps: AgentWorkspaceDeps, caller: McpCaller, params: unknown): Promise<McpToolCallOutcome> {
  if (!isObject<Record<string, unknown>>(params) || typeof params.name !== "string") {
    return {ok: false, error: {code: -32602, message: "tools/call needs a tool name"}}
  }

  const {name} = params
  if (!findTool(name)) return {ok: false, error: {code: -32602, message: `Unknown tool: ${name}`}}

  const rawArguments = params.arguments
  if (rawArguments !== undefined && rawArguments !== null && !isObject(rawArguments)) {
    return {ok: false, error: {code: -32602, message: `Invalid arguments for tool ${name}: arguments must be an object`}}
  }

  if (caller.timeZone === null) {
    const message =
      "This agent's Mac has not told the server its time zone yet, so the server cannot tell which day it is there. Open Daily on that Mac and let it sync once, then try again."
    return {ok: true, result: errorResult(ToolErrorCode.MAC_TIME_ZONE_UNKNOWN, message)}
  }

  const toolArguments = isObject<Record<string, unknown>>(rawArguments) ? rawArguments : {}
  const outcome = await runAgentTool(deps, {deviceId: caller.deviceId, timeZone: caller.timeZone, name: caller.name}, {name, input: toolArguments})

  return {ok: true, result: renderToolOutcome(name, outcome)}
}

function renderToolOutcome(name: string, outcome: AgentToolOutcome): McpToolResult {
  if (!outcome.ok) return errorResult(outcome.error.code, outcome.error.message)

  if (name === "get_attachment") {
    const attachment = outcome.data as ToolAttachment
    return {content: [{type: "image", data: attachment.dataBase64, mimeType: attachment.mimeType}]}
  }

  return {content: [{type: "text", text: JSON.stringify(outcome.data)}]}
}

function errorResult(code: ToolErrorCode, message: string): McpToolResult {
  return {content: [{type: "text", text: JSON.stringify({error: {code, message}})}], isError: true}
}
