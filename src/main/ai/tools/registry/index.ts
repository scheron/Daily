import {FILE_TOOLS} from "./categories/files"
import {META_TOOLS} from "./categories/meta"
import {PROJECT_TOOLS} from "./categories/projects"
import {SUMMARY_TOOLS} from "./categories/summary"
import {TAG_TOOLS} from "./categories/tags"
import {TASK_TOOLS} from "./categories/tasks"
import {WEB_TOOLS} from "./categories/web"

import type {Tool} from "@/ai/types"
import type {RegisteredTool} from "./types"

/**
 * Authoritative list of all tools exposed to the AI agent.
 * Populated by category files (see ./categories/*).
 * Derives AI_TOOLS, AI_TOOLS_COMPACT, and ToolName.
 *
 * META_TOOLS come first so the `respond` protocol tool is always present
 * in every tier's tool list.
 */
export const REGISTRY: ReadonlyArray<RegisteredTool> = [
  ...META_TOOLS,
  ...TASK_TOOLS,
  ...TAG_TOOLS,
  ...PROJECT_TOOLS,
  ...FILE_TOOLS,
  ...SUMMARY_TOOLS,
  ...WEB_TOOLS,
]

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

export const AI_TOOLS_COMPACT: Tool[] = REGISTRY.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.compactDescription ?? t.description,
    parameters: t.compactParameters ?? t.parameters,
  },
}))

export type {RegisteredTool, ToolCaller, ToolExecutionContext, ToolParameters} from "./types"
