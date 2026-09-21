import {RESPONSE_SENT} from "../../http/respond"

import type {ServerResponse} from "node:http"

/** Writes `payload` as JSON, outside the Daily Sync Protocol envelope: no `{ok, data}`, no gzip. */
export function respondJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): typeof RESPONSE_SENT {
  res.writeHead(status, {"content-type": "application/json", "cache-control": "no-store", ...headers})
  res.end(JSON.stringify(payload))

  return RESPONSE_SENT
}

/**
 * The OAuth/MCP surface of the same fact `POST /v1/agents/window/open` answers with `409
 * AGENTS_NOT_SUPPORTED`: the two statuses differ by convention, deliberately, one for a JSON
 * client and a browser, the other for the Daily Sync Protocol's own envelope.
 */
export function respondAgentsNotAccepted(res: ServerResponse): typeof RESPONSE_SENT {
  return respondJson(res, 404, {
    error: "agents_not_supported",
    error_description: "This Daily Sync Server does not accept agents: agents need an HTTPS address with a trusted certificate.",
  })
}
