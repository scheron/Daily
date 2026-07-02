import {isString} from "@shared/utils/common/validators"

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
      contentLength: isString(m.content) ? m.content.length : 0,
      ...(m.tool_calls && m.tool_calls.length ? {toolCallNames: m.tool_calls.map((tc) => tc.function.name)} : {}),
    })),
  }
}
