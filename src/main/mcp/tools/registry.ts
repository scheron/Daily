import {REGISTRY} from "@/ai/tools/registry"
import {MCP_BLOCKED_TOOL_NAMES, MCP_HIDDEN_TOOL_NAMES} from "@/mcp/constants"

export {MCP_BLOCKED_TOOL_NAMES, MCP_HIDDEN_TOOL_NAMES} from "@/mcp/constants"

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
  const excluded = new Set<string>([...MCP_BLOCKED_TOOL_NAMES, ...MCP_HIDDEN_TOOL_NAMES])
  const tools: McpTool[] = REGISTRY.filter((t) => !excluded.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.parameters ?? {type: "object"}) as McpTool["inputSchema"],
  }))

  const byName = new Map(tools.map((t) => [t.name, t]))

  return {
    list: () => tools,
    has: (name) => byName.has(name),
  }
}
