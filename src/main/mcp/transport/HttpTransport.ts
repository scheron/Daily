import {createServer} from "node:http"

import {logger} from "@/utils/logger"

import {MCP_SERVER_NAME} from "@/mcp/constants"

import type {BearerAuth} from "@/mcp/auth/bearerAuth"
import type {IncomingMessage, Server, ServerResponse} from "node:http"

export type JsonRpcHandler = (body: unknown) => Promise<unknown | null>

export type HttpTransportOptions = {
  host: string
  port: number
  auth: BearerAuth
  handleJsonRpc: JsonRpcHandler
  appVersion: string
}

export class HttpTransport {
  private server: Server | null = null
  private boundPort = 0

  constructor(private opts: HttpTransportOptions) {}

  get port(): number {
    return this.boundPort
  }

  async start(): Promise<void> {
    if (this.server) throw new Error("HttpTransport already started")

    const server = createServer((req, res) => this.handle(req, res))

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener("listening", onListening)
        reject(err)
      }
      const onListening = () => {
        server.removeListener("error", onError)
        resolve()
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(this.opts.port, this.opts.host)
    })

    const addr = server.address()
    this.boundPort = typeof addr === "object" && addr ? addr.port : this.opts.port
    this.server = server

    logger.info(logger.CONTEXT.MCP, `HTTP transport listening on ${this.opts.host}:${this.boundPort}`)
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null

    await new Promise<void>((resolve) => server.close(() => resolve()))
    logger.info(logger.CONTEXT.MCP, "HTTP transport stopped")
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/"
    const ip = req.socket.remoteAddress ?? "unknown"

    if (req.method === "GET" && url === "/mcp/health") {
      res.writeHead(200, {"Content-Type": "application/json"})
      res.end(JSON.stringify({status: "ok", name: MCP_SERVER_NAME, version: this.opts.appVersion}))
      return
    }

    if (url !== "/mcp") {
      res.writeHead(404).end()
      return
    }

    if (req.method !== "POST") {
      res.writeHead(405, {Allow: "POST"}).end()
      return
    }

    const auth = this.opts.auth.check(req.headers.authorization, ip)
    if (!auth.ok) {
      res.writeHead(auth.status, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: auth.reason}))
      return
    }

    let body: unknown
    try {
      body = await readJson(req)
    } catch {
      res.writeHead(400, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: "invalid_json"}))
      return
    }

    try {
      const result = await this.opts.handleJsonRpc(body)
      if (result === null) {
        res.writeHead(204).end()
      } else {
        res.writeHead(200, {"Content-Type": "application/json"})
        res.end(JSON.stringify(result))
      }
    } catch (err) {
      logger.error(logger.CONTEXT.MCP, "JSON-RPC handler threw", err)
      res.writeHead(500, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: "internal"}))
    }
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString("utf8")
  return JSON.parse(text)
}
