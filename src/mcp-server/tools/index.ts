import {registerTagTools} from "@/tools/tags"
import {registerTaskTools} from "@/tools/tasks"

import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"

export function registerAllTools(server: McpServer): void {
  registerTaskTools(server)
  registerTagTools(server)
}
