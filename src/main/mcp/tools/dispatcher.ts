import {logger} from "@/utils/logger"

import {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

import type {ToolExecutor} from "@/ai/tools/ToolExecutor"
import type {ToolResult} from "@/ai/tools/types"
import type {McpToolRegistry} from "@/mcp/tools/registry"

const BLOCKED = new Set<string>(MCP_BLOCKED_TOOL_NAMES)

export class McpToolDispatcher {
  constructor(
    private registry: McpToolRegistry,
    private executor: Pick<ToolExecutor, "execute">,
  ) {}

  async call(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry.has(name)) {
      const message = BLOCKED.has(name) ? `Tool '${name}' is not exposed via MCP` : `Unknown tool: ${name}`
      logger.warn(logger.CONTEXT.MCP, message)
      return {success: false, error: message}
    }

    try {
      return await this.executor.execute(name as any, params, "mcp")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.MCP, `Tool '${name}' threw`, err)
      return {success: false, error: message}
    }
  }
}
