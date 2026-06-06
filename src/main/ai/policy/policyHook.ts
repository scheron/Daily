import {getRegisteredTool} from "@/ai/tools/registry"

import type {BeforeToolCallHook} from "@/ai/hooks/types"
import type {PolicyHookHost} from "./types"

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== "string") return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Creates the policy hook that gates destructive tools behind explicit user
 * confirmation. Read-only and non-destructive write tools (create/update/
 * complete/etc) pass straight through.
 *
 * MCP calls do not fire this hook — they bypass the hook chain entirely
 * because confirmation happens on the MCP client surface.
 */
export function createPolicyHook(host: PolicyHookHost): BeforeToolCallHook {
  return async (_ctx, call) => {
    const name = call.function.name
    const tool = getRegisteredTool(name)

    if (!tool) {
      return {action: "skip", reason: `Unknown tool: ${name}`}
    }

    if (!tool.isDestructive) {
      return {action: "pass"}
    }

    const params = parseArgs(call.function.arguments)
    const confirmed = await host.awaitConfirmation(name, params)
    if (confirmed) return {action: "pass"}
    return {action: "skip", reason: "User declined the action"}
  }
}
