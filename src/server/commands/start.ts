import {resolveServerConfig} from "@server/config/resolveServerConfig"
import {clearExpiredIssuedTokens} from "@server/enrollment/EnrollmentStore"
import {createHttpServer} from "@server/http/createHttpServer"
import {ensureClaimCode} from "@server/identity/ServerIdentityStore"
import {openServerStore} from "@server/store/instance"

import type {ServerConfigOptions} from "@server/config/resolveServerConfig"
import type {Command} from "commander"

type StartOptions = {host?: string; port?: string; dataDir?: string; cert?: string; key?: string}

/** Registers `daily-server start`: opens the store, binds the configured host and port, and serves. */
export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the Daily Sync Server")
    .option("--host <host>", "address to bind")
    .option("--port <port>", "port to bind")
    .option("--data-dir <path>", "server data directory")
    .option("--cert <path>", "TLS certificate path")
    .option("--key <path>", "TLS private key path")
    .action((opts: StartOptions) => runStart(opts))
}

function runStart(opts: StartOptions): void {
  const configOptions: ServerConfigOptions = {
    host: opts.host,
    port: opts.port !== undefined ? Number(opts.port) : undefined,
    dataDir: opts.dataDir,
    cert: opts.cert,
    key: opts.key,
  }
  const config = resolveServerConfig(configOptions)

  const store = openServerStore(config.dataDir)
  clearExpiredIssuedTokens(store)

  const claimCode = ensureClaimCode(store)
  const server = createHttpServer(store, config)

  server.listen(config.port, config.host, () => {
    const scheme = config.tls ? "https" : "http"
    console.log(`Daily Sync Server listening on ${scheme}://${config.host}:${config.port}`)

    if (claimCode) console.log(`This server is unclaimed. Claim code: ${claimCode}`)
  })
}
