import type {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import type {ServerResponse} from "node:http"

/**
 * Writes a successful Daily Sync Protocol response: `204` with no body when `data` is
 * `undefined`, `200` with `{ok: true, data}` otherwise.
 */
export function respondOk(res: ServerResponse, data: unknown): void {
  if (data === undefined) {
    res.writeHead(204)
    res.end()
    return
  }

  writeJson(res, 200, {ok: true, data})
}

/** Writes a failed Daily Sync Protocol response at the error's own HTTP status. */
export function respondError(res: ServerResponse, error: ProtocolError): void {
  writeJson(res, error.status, {ok: false, error: {code: error.code, message: error.message}})
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {"content-type": "application/json"})
  res.end(JSON.stringify(payload))
}
