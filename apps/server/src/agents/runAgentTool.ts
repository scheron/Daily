import {AgentToolError} from "../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../errors/agent/AgentToolErrorCode"
import {runInAgentWorkspace} from "./AgentWorkspace"
import {findAgentTool} from "./tools"

import type {AgentIdentity, AgentWorkspaceDeps} from "./AgentWorkspace"

export type AgentToolCall = {name: string; input: Record<string, unknown>}

export type AgentToolOutcome = {ok: true; data: unknown} | {ok: false; error: {code: AgentToolErrorCode; message: string}}

/**
 * Runs one named tool call for an agent and never rejects: an unknown name, a tool's own
 * refusal and any unexpected throw all come back as a coded `AgentToolOutcome` instead.
 */
export async function runAgentTool(deps: AgentWorkspaceDeps, agent: AgentIdentity, call: AgentToolCall): Promise<AgentToolOutcome> {
  const tool = findAgentTool(call.name)
  if (!tool) return {ok: false, error: {code: AgentToolErrorCode.UNKNOWN_TOOL, message: `Unknown tool "${call.name}".`}}

  try {
    const data = await runInAgentWorkspace(deps, agent, tool.mode, (ctx) => tool.run(call.input, ctx))
    return {ok: true, data}
  } catch (error) {
    if (error instanceof AgentToolError) return {ok: false, error: {code: error.code, message: error.message}}

    console.error(error)
    return {ok: false, error: {code: AgentToolErrorCode.INTERNAL, message: error instanceof Error ? error.message : String(error)}}
  }
}
