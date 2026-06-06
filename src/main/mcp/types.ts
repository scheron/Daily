export type {McpStatus} from "@shared/types/mcp"
export type {McpSettings as McpConfig} from "@shared/types/storage"

export type McpAuthFailureReason = "missing_header" | "invalid_scheme" | "wrong_token" | "locked_out"

export type McpAuthResult = {ok: true} | {ok: false; reason: McpAuthFailureReason; status: 401 | 429}
