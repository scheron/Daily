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

/**
 * Protocol-level tools that are part of the in-app agent loop and have no
 * meaning for external MCP clients. They are hidden from MCP, but they are
 * NOT destructive — kept in a separate list so the security boundary
 * (MCP_BLOCKED_TOOL_NAMES) and the protocol boundary (this list) stay
 * conceptually distinct.
 */
export const MCP_HIDDEN_TOOL_NAMES = ["respond"] as const

export type McpHiddenToolName = (typeof MCP_HIDDEN_TOOL_NAMES)[number]
