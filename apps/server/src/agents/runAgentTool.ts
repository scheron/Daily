import {findTool, ToolError, ToolErrorCode} from "@daily/tools"

import {runInAgentWorkspace} from "./AgentWorkspace"

import type {AgentIdentity, AgentWorkspaceDeps} from "./AgentWorkspace"

export type AgentToolCall = {name: string; input: Record<string, unknown>}

export type AgentToolOutcome = {ok: true; data: unknown} | {ok: false; error: {code: ToolErrorCode; message: string}}

/**
 * Runs one named tool call for an agent and never rejects: an unknown name, a tool's own
 * refusal and any unexpected throw all come back as a coded `AgentToolOutcome` instead.
 */
export async function runAgentTool(deps: AgentWorkspaceDeps, agent: AgentIdentity, call: AgentToolCall): Promise<AgentToolOutcome> {
  const tool = findTool(call.name)
  if (!tool) return {ok: false, error: {code: ToolErrorCode.UNKNOWN_TOOL, message: `Unknown tool "${call.name}".`}}

  try {
    const data = await runInAgentWorkspace(deps, agent, tool.mode, (ctx) => tool.run(call.input, ctx))
    return {ok: true, data}
  } catch (error) {
    if (error instanceof ToolError) return {ok: false, error: {code: error.code, message: error.message}}

    console.error(error)
    return {ok: false, error: {code: ToolErrorCode.INTERNAL, message: error instanceof Error ? error.message : String(error)}}
  }
}
