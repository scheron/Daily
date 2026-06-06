import {logger} from "@/utils/logger"

import {BearerAuth} from "@/mcp/auth/bearerAuth"
import {MCP_SERVER_NAME} from "@/mcp/constants"
import {McpToolDispatcher} from "@/mcp/tools/dispatcher"
import {buildMcpToolRegistry} from "@/mcp/tools/registry"
import {HttpTransport} from "@/mcp/transport/HttpTransport"
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js"
import {Server as SdkServer} from "@modelcontextprotocol/sdk/server/index.js"
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js"

import type {ToolExecutor} from "@/ai/tools/ToolExecutor"
import type {McpConfig, McpStatus} from "@/mcp/types"
import type {JSONRPCMessage} from "@modelcontextprotocol/sdk/types.js"

export type McpServerOptions = {
  executor: Pick<ToolExecutor, "execute">
  appVersion: string
  /**
   * Notified whenever the server's externally-observable status changes.
   * Used by the app to broadcast over IPC; tests omit this.
   */
  onStatusChange?: (status: McpStatus) => void
}

export class McpServer {
  private status_: McpStatus = {state: "stopped"}
  private transport: HttpTransport | null = null
  private auth: BearerAuth | null = null
  private clientSide: InMemoryTransport | null = null
  private pendingResolvers = new Map<number | string, (msg: JSONRPCMessage) => void>()

  constructor(private opts: McpServerOptions) {}

  status(): McpStatus {
    return this.status_
  }

  rotateToken(next: string): void {
    this.auth?.rotateToken(next)
  }

  async start(config: McpConfig): Promise<void> {
    if (this.status_.state === "running" || this.status_.state === "starting") {
      await this.stop()
    }
    this.setStatus({state: "starting"})

    try {
      this.auth = new BearerAuth(config.token)
      const registry = buildMcpToolRegistry()
      const dispatcher = new McpToolDispatcher(registry, this.opts.executor)

      const sdkServer = new SdkServer({name: MCP_SERVER_NAME, version: this.opts.appVersion}, {capabilities: {tools: {}}})

      sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: registry.list(),
      }))

      sdkServer.setRequestHandler(CallToolRequestSchema, async (req) => {
        const name = req.params.name
        const args = (req.params.arguments ?? {}) as Record<string, unknown>
        const result = await dispatcher.call(name, args)

        const text = result.success ? JSON.stringify(result.data ?? {success: true}, null, 2) : `Error: ${result.error ?? "unknown error"}`

        return {
          content: [{type: "text", text}],
          isError: !result.success,
        }
      })

      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()

      clientSide.onmessage = (message: JSONRPCMessage) => {
        const id = (message as any).id
        if (id !== undefined && id !== null) {
          const resolve = this.pendingResolvers.get(id)
          if (resolve) {
            this.pendingResolvers.delete(id)
            resolve(message)
          }
        }
      }

      await sdkServer.connect(serverSide)

      this.clientSide = clientSide

      const transport = new HttpTransport({
        host: config.host,
        port: config.port,
        auth: this.auth,
        appVersion: this.opts.appVersion,
        handleJsonRpc: (body) => this.handleJsonRpc(body),
      })

      await transport.start()
      this.transport = transport

      this.setStatus({state: "running", host: config.host, port: transport.port})
      logger.info(logger.CONTEXT.MCP, `McpServer started on ${config.host}:${transport.port}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.MCP, "McpServer failed to start", err)
      this.setStatus({state: "error", message})
      this.transport = null
      this.clientSide = null
      this.auth = null
    }
  }

  async stop(): Promise<void> {
    if (this.status_.state === "stopped") return
    this.setStatus({state: "stopping"})

    try {
      if (this.transport) await this.transport.stop()
      if (this.clientSide) await this.clientSide.close()
    } finally {
      this.transport = null
      this.clientSide = null
      this.auth = null
      this.pendingResolvers.clear()
      this.setStatus({state: "stopped"})
      logger.info(logger.CONTEXT.MCP, "McpServer stopped")
    }
  }

  private async handleJsonRpc(body: unknown): Promise<JSONRPCMessage | null> {
    const clientSide = this.clientSide
    if (!clientSide) throw new Error("MCP transport not initialized")

    const msg = body as JSONRPCMessage
    const id = (msg as any).id

    if (id === undefined || id === null) {
      await clientSide.send(msg)
      return null
    }

    return new Promise<JSONRPCMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolvers.delete(id)
        reject(new Error(`MCP request timeout for id=${id}`))
      }, 30_000)

      this.pendingResolvers.set(id, (response) => {
        clearTimeout(timer)
        resolve(response)
      })

      clientSide.send(msg).catch((err) => {
        clearTimeout(timer)
        this.pendingResolvers.delete(id)
        reject(err)
      })
    })
  }

  private setStatus(next: McpStatus): void {
    this.status_ = next
    this.opts.onStatusChange?.(next)
  }
}
