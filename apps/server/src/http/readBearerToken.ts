import type {IncomingMessage} from "node:http"

export function readBearerToken(req: IncomingMessage): string | null {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "")

  return match?.[1] ?? null
}
