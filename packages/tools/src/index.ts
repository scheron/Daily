import {READ_TOOLS} from "./read"
import {WRITE_TOOLS} from "./write"

import type {Tool} from "./types"

export {createClock} from "./clock"
export {ToolError} from "./errors/ToolError"
export {ToolErrorCode} from "./errors/ToolErrorCode"

export type {ToolAttachment} from "./read/getAttachment"
export type {Tool, ToolClock, ToolContext, ToolFilesPort, ToolInputSchema, ToolMode} from "./types"

/** The shared set, in the order `tools/list` advertises it: every read, then every write. */
export const TOOLS: readonly Tool[] = READ_TOOLS.concat(WRITE_TOOLS)

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name)
}
