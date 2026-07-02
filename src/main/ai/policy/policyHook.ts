import {isObject, isString} from "@shared/utils/common/validators"

import {getRegisteredTool} from "@/ai/tools/registry"

import type {BeforeToolCallHook} from "@/ai/hooks/types"
import type {PolicyHookHost} from "./types"

/**
 * Creates the policy hook that gates destructive tools behind explicit user
 * confirmation. Read-only and non-destructive write tools (create/update/
 * complete/etc) pass straight through.
 */
export function createPolicyHook(host: PolicyHookHost): BeforeToolCallHook {
  return async (_ctx, call) => {
    const name = call.function.name
    const tool = getRegisteredTool(name)

    if (!tool) {
      return {action: "skip", reason: `Unknown tool: ${name}`}
    }

    if (!tool.isDestructive && !tool.isExternalEgress) {
      return {action: "pass"}
    }

    const params = parseArgs(call.function.arguments)

    if (tool.isExternalEgress && !tool.isDestructive) {
      if (host.isEgressAutoApproved()) return {action: "pass"}
      // No confirmation when this call won't actually leave the machine (e.g. cache hit).
      if (tool.willEgress && !tool.willEgress(params, host.getWebPageCache())) return {action: "pass"}
    }

    const confirmed = await host.awaitConfirmation(name, params)
    if (confirmed) return {action: "pass"}
    return {action: "skip", reason: "User declined the action"}
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (isObject(raw)) return raw as Record<string, unknown>
  if (!isString(raw)) return {}
  try {
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
