import http from "node:http"
import https from "node:https"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"

import type {IncomingMessage} from "node:http"

export type PublicUrlVerification = {serverId: string; protocol: number; claimed: boolean}

const VERIFY_TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 64 * 1024

/** Fetches `<publicUrl>/v1/server` and confirms this server answers there. Throws on anything else. */
export async function verifyPublicUrl(publicUrl: string, expectedServerId: string, allowSelfSigned: boolean): Promise<PublicUrlVerification> {
  const target = `${publicUrl.replace(/\/+$/, "")}${SYNC_PROTOCOL_PATHS.server}`
  const info = parseServerInfo(await readBody(target, allowSelfSigned), target)

  if (info.serverId !== expectedServerId) {
    throw new ServerSetupError(
      ServerSetupErrorCode.VERIFICATION_FAILED,
      `Another Daily Sync Server answers at ${target} — it reports the id ${info.serverId}, and this host's server is ${expectedServerId}. Check that the public address points at this machine and that nothing else is published on that port.`,
    )
  }

  return info
}

function readBody(target: string, allowSelfSigned: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let url: URL
    try {
      url = new URL(target)
    } catch {
      reject(unreachable(target, "it is not a valid URL"))
      return
    }

    const onResponse = (res: IncomingMessage): void => {
      const chunks: Buffer[] = []
      let size = 0

      res.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          res.destroy()
          reject(notADailyServer(target))
          return
        }
        chunks.push(chunk)
      })
      res.on("error", (err: Error) => reject(unreachable(target, err.message)))
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
    }

    const request =
      url.protocol === "https:"
        ? https.request(url, {method: "GET", timeout: VERIFY_TIMEOUT_MS, rejectUnauthorized: !allowSelfSigned}, onResponse)
        : http.request(url, {method: "GET", timeout: VERIFY_TIMEOUT_MS}, onResponse)

    request.on("timeout", () => request.destroy(new Error(`nothing answered within ${VERIFY_TIMEOUT_MS / 1000} seconds`)))
    request.on("error", (err: Error) => reject(unreachable(target, err.message)))
    request.end()
  })
}

function parseServerInfo(body: string, target: string): PublicUrlVerification {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw notADailyServer(target)
  }

  if (typeof parsed !== "object" || parsed === null) throw notADailyServer(target)

  const envelope = parsed as {ok?: unknown; data?: unknown}
  if (envelope.ok !== true || typeof envelope.data !== "object" || envelope.data === null) throw notADailyServer(target)

  const data = envelope.data as Record<string, unknown>
  if (typeof data.serverId !== "string" || typeof data.protocol !== "number" || typeof data.claimed !== "boolean") {
    throw notADailyServer(target)
  }

  return {serverId: data.serverId, protocol: data.protocol, claimed: data.claimed}
}

function unreachable(target: string, detail: string): ServerSetupError {
  return new ServerSetupError(
    ServerSetupErrorCode.VERIFICATION_FAILED,
    `Could not reach ${target}: ${detail}. Check that the port is open on the host's firewall and on any provider firewall in front of it, that the address is the one this machine is reachable at, and that the bind address covers it.`,
  )
}

function notADailyServer(target: string): ServerSetupError {
  return new ServerSetupError(
    ServerSetupErrorCode.NOT_A_DAILY_SERVER,
    `Something is answering at ${target}, but its response is not a Daily Sync Server's. Another service is published on that address — point DAILY_SERVER_PUBLIC_URL at an address that reaches this server instead.`,
  )
}
