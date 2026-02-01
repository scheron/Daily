import type {StorageController} from "@/storage/StorageController"
import type http from "node:http"

export type McpRequestContext = {
  storage: StorageController
  params: URLSearchParams
  body: unknown
  pathParams: Record<string, string>
}

export type McpRouteHandler = (ctx: McpRequestContext) => Promise<McpRouteResult>

export type McpRouteResult = {
  status: number
  data: unknown
}

export type McpRoute = {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: McpRouteHandler
}

export type McpHttpRequest = http.IncomingMessage
export type McpHttpResponse = http.ServerResponse
