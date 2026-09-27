import {ToolError, TOOLS} from "@daily/tools"

import {buildToolContext} from "./toolContext"

import type {Tool as SharedTool} from "@daily/tools"
import type {RegisteredTool} from "@main/ai/tools/registry/types"

function wrapSharedTool(tool: SharedTool): RegisteredTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    isWrite: tool.mode !== "read",
    isDestructive: tool.mode === "delete",
    async execute(params, ctx) {
      const toolContext = buildToolContext(ctx.storage)
      try {
        const data = await tool.run(params, toolContext)
        return {success: true, data}
      } catch (err) {
        if (err instanceof ToolError) return {success: false, error: err.message}
        throw err
      }
    },
  }
}

/** Every tool agents over MCP and the Daily Assistant both share, in `@daily/tools`' own order. */
export const SHARED_TOOLS: readonly RegisteredTool[] = TOOLS.map(wrapSharedTool)
