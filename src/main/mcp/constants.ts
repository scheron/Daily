export const MCP_SERVER_NAME = "daily"

export const MCP_DEFAULT_PORT = 7878
export const MCP_DEFAULT_HOST = "127.0.0.1"

export const MCP_AUTH_LOCKOUT_THRESHOLD = 5
export const MCP_AUTH_LOCKOUT_WINDOW_MS = 60_000
export const MCP_AUTH_LOCKOUT_DURATION_MS = 60_000

export const MCP_TOKEN_BYTES = 24

/**
 * Tool names from the AI tool set that MUST NOT be exposed via MCP because
 * they are irreversibly destructive or affect data the user cannot recover
 * via Daily's trash UI.
 */
export const MCP_BLOCKED_TOOL_NAMES = ["permanently_delete_task", "delete_project", "delete_tag", "remove_task_attachment"] as const

export type McpBlockedToolName = (typeof MCP_BLOCKED_TOOL_NAMES)[number]
