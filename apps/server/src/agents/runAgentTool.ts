import {TaskWorkflowError} from "@daily/core/storage/TaskWorkflowError"
import {findTool, taskWorkflowView, ToolError, ToolErrorCode} from "@daily/tools"

import {runInAgentWorkspace} from "./AgentWorkspace"

import type {AgentIdentity, AgentWorkspaceDeps} from "./AgentWorkspace"

export type AgentToolCall = {name: string; input: Record<string, unknown>}

export type AgentToolOutcome = {ok: true; data: unknown} | {ok: false; error: {code: string; message: string; current?: unknown}}

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
    if (error instanceof ToolError || error instanceof TaskWorkflowError) {
      let current = error instanceof TaskWorkflowError ? error.current : null
      if (call.name === "update_task_workflow" && error.code === ToolErrorCode.WRITE_CONFLICT && typeof call.input.taskId === "string") {
        const taskId = call.input.taskId
        current = await runInAgentWorkspace(deps, agent, "read", (ctx) => ctx.workStorage.getTaskWorkflow(taskId)).catch(() => null)
      }
      return {ok: false, error: {code: error.code, message: error.message, ...(current && {current: taskWorkflowView(current)})}}
    }

    console.error(error)
    return {ok: false, error: {code: ToolErrorCode.INTERNAL, message: error instanceof Error ? error.message : String(error)}}
  }
}
