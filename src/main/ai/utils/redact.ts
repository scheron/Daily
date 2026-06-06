import type {MessageLLM} from "@/ai/types"

/**
 * Redact AI messages for log output. Keeps structural shape (roles,
 * message count, tool-call names) but never emits free-form user or tool
 * content. Use in default logging paths.
 */
export function redactAiMessagesForLog(messages: ReadonlyArray<MessageLLM>): {
  count: number
  roles: Array<{role: string; contentLength: number; toolCallNames?: string[]}>
} {
  return {
    count: messages.length,
    roles: messages.map((m) => ({
      role: m.role,
      contentLength: typeof m.content === "string" ? m.content.length : 0,
      ...(m.tool_calls && m.tool_calls.length ? {toolCallNames: m.tool_calls.map((tc) => tc.function.name)} : {}),
    })),
  }
}

/**
 * Redact tool params for log output. Keeps the keys so debugging "called
 * with wrong fields" is still possible, but drops the values.
 */
export function redactToolParamsForLog(toolName: string, params: unknown): {toolName: string; paramKeys: string[]} {
  const keys: string[] = []
  if (params && typeof params === "object" && !Array.isArray(params)) {
    keys.push(...Object.keys(params as Record<string, unknown>))
  } else if (typeof params === "string") {
    try {
      const parsed = JSON.parse(params)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        keys.push(...Object.keys(parsed as Record<string, unknown>))
      }
    } catch {
      // params is a non-JSON string — emit no keys.
    }
  }
  return {toolName, paramKeys: keys}
}
