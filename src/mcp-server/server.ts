import {MCP_CONFIG} from "@/config"
import {registerAllTools} from "@/tools"
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"

export function createServer(): McpServer {
  const server = new McpServer({
    name: MCP_CONFIG.name,
    version: MCP_CONFIG.version,
  })

  registerAllTools(server)

  return server
}

export async function startServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  console.error(`Daily MCP Server v${MCP_CONFIG.version} started`)
  console.error(`Connecting to Daily API at: ${MCP_CONFIG.apiUrl}`)
}
