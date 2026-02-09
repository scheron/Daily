export type ToolResult = {
  success: boolean
  data?: unknown
  error?: string
}

export type ToolParams = Record<string, unknown>
