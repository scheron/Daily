import {AI_TOOLS} from "@/ai/tools/tools"
import {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

export {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

export type McpTool = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export type McpToolRegistry = {
  list(): McpTool[]
  has(name: string): boolean
}

export function buildMcpToolRegistry(): McpToolRegistry {
  const blocked = new Set<string>(MCP_BLOCKED_TOOL_NAMES)
  const tools: McpTool[] = AI_TOOLS.filter((t) => !blocked.has(t.function.name)).map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    inputSchema: (t.function.parameters ?? {type: "object"}) as McpTool["inputSchema"],
  }))

  const byName = new Map(tools.map((t) => [t.name, t]))

  return {
    list: () => tools,
    has: (name) => byName.has(name),
  }
}
