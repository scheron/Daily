import {apiRequest, checkDailyRunning, formatTag} from "@/api"
import {dailyNotRunningError, errorResult, textResult} from "@/utils"

import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import type {Tag} from "@shared/types/storage"

export function registerTagTools(server: McpServer): void {
  server.tool("list_tags", "Get all available tags from Daily app.", {}, async () => {
    try {
      if (!(await checkDailyRunning())) {
        return dailyNotRunningError()
      }

      const tags = await apiRequest<Tag[]>("GET", "/api/tags")

      if (tags.length === 0) {
        return textResult("No tags found.")
      }

      const tagList = tags.map((t, i) => formatTag(t, i)).join("\n")

      return textResult(`Tags (${tags.length} total):\n\n${tagList}`)
    } catch (error) {
      return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
