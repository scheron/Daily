import {META_TOOLS} from "./categories/meta"
import {SHARED_TOOLS} from "./categories/shared"
import {WEB_TOOLS} from "./categories/web"

import type {Tool} from "@main/ai/types"
import type {RegisteredTool} from "./types"

/**
 * Authoritative list of all tools exposed to the AI agent: `respond` and `read_url` are the
 * Assistant's own; everything else is `@daily/tools`' shared set, the same one an MCP agent runs.
 * Derives AI_TOOLS and ToolName.
 *
 * META_TOOLS come first so the `respond` protocol tool is always present.
 */
export const REGISTRY: ReadonlyArray<RegisteredTool> = META_TOOLS.concat(SHARED_TOOLS, WEB_TOOLS)

export type ToolName = (typeof REGISTRY)[number]["name"]

export const REGISTRY_BY_NAME: ReadonlyMap<string, RegisteredTool> = new Map(REGISTRY.map((t) => [t.name, t]))

export function getRegisteredTool(name: string): RegisteredTool | undefined {
  return REGISTRY_BY_NAME.get(name)
}

export const AI_TOOLS: Tool[] = REGISTRY.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))

export type {RegisteredTool, ToolCaller, ToolExecutionContext, ToolParameters} from "./types"
