/**
 * MCP-specific types (not in @shared)
 */

export type McpToolResult = {
  content: Array<{type: "text"; text: string}>
  isError?: boolean
}
