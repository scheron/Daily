import {READ_TOOLS} from "./read"
import {WRITE_TOOLS} from "./write"

import type {AgentTool} from "./types"

/** The agent's whole fixed tool set, D13's table order: every read, then every write. */
export const AGENT_TOOLS: readonly AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS]

export function findAgentTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
}
