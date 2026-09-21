import type {IncomingMessage} from "node:http"

/**
 * Reads a request body as UTF-8 text, for an agent endpoint that parses its own body. Resolves
 * `null` as soon as more than `maxBytes` has arrived, keeping nothing past the cap: the rest of
 * the body is drained rather than the request destroyed, so the caller's `413` still reaches the
 * client. No `content-encoding` is decoded.
 */
export function readAgentBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let isSettled = false

    req.on("data", (chunk: Buffer) => {
      if (isSettled) return

      received += chunk.length
      if (received > maxBytes) {
        isSettled = true
        chunks.length = 0
        resolve(null)
        return
      }

      chunks.push(chunk)
    })

    req.on("end", () => {
      if (isSettled) return
      isSettled = true

      resolve(Buffer.concat(chunks).toString("utf8"))
    })

    req.on("error", (err) => {
      if (isSettled) return
      isSettled = true

      reject(err)
    })
  })
}
