/**
 * HTTP API Server for MCP integration
 *
 * Provides a local HTTP endpoint for the MCP server to access Daily's data
 * without directly opening the PouchDB database (which would cause lock conflicts).
 */

import http from "node:http"

import {LogContext, logger} from "@/utils/logger"

import {mcpRoutes} from "./routes"

import type {StorageController} from "@/storage/StorageController"
import type {McpRoute} from "./types"

const PORT = 45678
const HOST = "127.0.0.1"

let server: http.Server | null = null

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ""

    req.on("data", (chunk) => (body += chunk))
    req.on("error", reject)
    req.on("end", () => {
      if (!body) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
  })
}

function findRoute(method: string, pathname: string): {route: McpRoute; pathParams: Record<string, string>} | null {
  const decodedPath = decodeURIComponent(pathname)

  for (const route of mcpRoutes) {
    if (route.method !== method) continue

    const match = decodedPath.match(route.pattern)

    if (match) {
      const pathParams: Record<string, string> = {}

      route.paramNames.forEach((name, i) => {
        pathParams[name] = match[i + 1]
      })

      return {route, pathParams}
    }
  }

  return null
}

export function setupMcpHttpApi(getStorage: () => StorageController | null): void {
  if (server) {
    logger.warn(LogContext.MCP, "MCP HTTP API already running")
    return
  }

  server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
      res.statusCode = 204
      res.end()
      return
    }

    const storage = getStorage()

    if (!storage) {
      res.statusCode = 503
      res.end(JSON.stringify({error: "Storage not initialized"}))
      return
    }

    try {
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`)
      const method = req.method || "GET"
      const found = findRoute(method, url.pathname)

      if (!found) {
        res.statusCode = 404
        res.end(JSON.stringify({error: "Not found"}))
        return
      }

      const body = await parseBody(req)

      const result = await found.route.handler({
        storage,
        params: url.searchParams,
        body,
        pathParams: found.pathParams,
      })

      res.statusCode = result.status
      res.end(JSON.stringify(result.data))
    } catch (error) {
      logger.error(LogContext.MCP, "HTTP API error", error)
      res.statusCode = 500
      res.end(JSON.stringify({error: error instanceof Error ? error.message : "Unknown error"}))
    }
  })

  server.listen(PORT, HOST, () => {
    logger.info(LogContext.MCP, `HTTP API listening on http://${HOST}:${PORT}`)
  })

  server.on("error", (err) => {
    logger.error(LogContext.MCP, "HTTP API failed to start", err)
  })
}

export function stopMcpHttpApi(): void {
  if (server) {
    server.close()
    server = null
    logger.info(LogContext.MCP, "HTTP API stopped")
  }
}
