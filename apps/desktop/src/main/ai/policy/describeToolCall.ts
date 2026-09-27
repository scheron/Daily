import {TOOL_CALL_DESCRIBERS} from "./toolCallDescribers"

import type {StorageController} from "@daily/core"
import type {ToolCallDescription} from "./types"

export async function describeToolCall(toolName: string, rawParams: unknown, storage: StorageController): Promise<ToolCallDescription> {
  const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>
  const describer = TOOL_CALL_DESCRIBERS[toolName]
  if (describer) return describer(params, storage)

  return {
    title: `Confirm action: ${toolName}`,
    summary: `The assistant requested a destructive action (${toolName}) that needs your approval.`,
  }
}
