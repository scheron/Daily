import http from "node:http"
import https from "node:https"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {resolveServerConfig} from "../config/resolveServerConfig"

import type {Command} from "commander"
import type {IncomingMessage} from "node:http"

type HealthcheckOptions = {dataDir?: string}

const HEALTHCHECK_TIMEOUT_MS = 5_000

/**
 * Registers `daily-server healthcheck`: confirms this container's own HTTP surface answers,
 * exiting non-zero when it does not. Unlike `verify`, which confirms a *public* address reaches
 * this server by identity (and needs the store to know that identity), this only confirms the
 * loopback surface responds — the store stays untouched, so this can answer while it is busy.
 */
export function registerHealthcheckCommand(program: Command): void {
  program
    .command("healthcheck")
    .description("Confirm this container's own HTTP surface answers")
    .option("--data-dir <path>", "server data directory")
    .action((opts: HealthcheckOptions) => runHealthcheck(opts))
}

async function runHealthcheck(opts: HealthcheckOptions): Promise<void> {
  const config = resolveServerConfig({dataDir: opts.dataDir})
  const scheme = config.transport === "self-signed" ? "https" : "http"
  const target = `${scheme}://127.0.0.1:${config.port}${SYNC_PROTOCOL_PATHS.server}`

  await requestOnce(target, config.transport === "self-signed")
}

function requestOnce(target: string, allowSelfSigned: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(target)

    const onResponse = (res: IncomingMessage): void => {
      res.resume()
      resolve()
    }

    const request =
      url.protocol === "https:"
        ? https.request(url, {method: "GET", timeout: HEALTHCHECK_TIMEOUT_MS, rejectUnauthorized: !allowSelfSigned}, onResponse)
        : http.request(url, {method: "GET", timeout: HEALTHCHECK_TIMEOUT_MS}, onResponse)

    request.on("timeout", () => request.destroy(new Error("timed out")))
    request.on("error", () => reject(new Error(`Could not reach ${target}`)))
    request.end()
  })
}
