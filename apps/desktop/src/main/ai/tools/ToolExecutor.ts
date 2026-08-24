import {logger} from "@daily/core"

import {redactToolParamsForLog} from "../utils/logs/redactToolParamsForLog"
import {getRegisteredTool} from "./registry"

import type {StorageController} from "@daily/core"
import type {LRU} from "@daily/std"
import type {CachedPage} from "../web/types"
import type {ToolCaller, ToolName} from "./registry"
import type {ToolParams, ToolResult} from "./types"

type ToolExtraContext = {
  webRead?: {windowChars: number; maxServedChars: number}
  pageCache?: LRU<string, CachedPage>
}

export class ToolExecutor {
  constructor(private storage: StorageController) {}

  async execute(toolName: ToolName, params: ToolParams, caller: ToolCaller, extra?: ToolExtraContext): Promise<ToolResult> {
    logger.debug(logger.CONTEXT.AI, `Executing tool: ${toolName} (${caller})`, redactToolParamsForLog(toolName, params))

    const tool = getRegisteredTool(toolName)
    if (!tool) {
      return {success: false, error: `Unknown tool: ${toolName}`}
    }

    try {
      return await tool.execute(params, {
        storage: this.storage,
        now: () => new Date(),
        caller,
        webRead: extra?.webRead,
        pageCache: extra?.pageCache,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.AI, `Tool execution failed: ${toolName}`, err)
      return {success: false, error: message}
    }
  }
}
