import {resolveServerConfig} from "../config/resolveServerConfig"
import {clearExpiredIssuedTokens} from "../enrollment/EnrollmentStore"
import {createHttpServer} from "../http/createHttpServer"
import {ensureClaimCode, loadIdentity} from "../identity/ServerIdentityStore"
import {openServerStore} from "../store/instance"
import {ensureTlsMaterial} from "../tls/ensureTlsMaterial"
import {verifyPublicUrl} from "../verify/verifyPublicUrl"

import type {Command} from "commander"
import type {ServerConfig, ServerConfigOptions} from "../config/resolveServerConfig"

type StartOptions = {
  host?: string
  port?: string
  dataDir?: string
  cert?: string
  key?: string
  maxAssetBytes?: string
  maxSnapshotBytes?: string
}

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
    .option("--max-asset-bytes <bytes>", "maximum size of a single asset upload")
    .option("--max-snapshot-bytes <bytes>", "maximum size of a snapshot write body")
    .action((opts: StartOptions) => runStart(opts))
}

function runStart(opts: StartOptions): void {
  const configOptions: ServerConfigOptions = {
    host: opts.host,
    port: opts.port !== undefined ? Number(opts.port) : undefined,
    dataDir: opts.dataDir,
    cert: opts.cert,
    key: opts.key,
    maxAssetBytes: opts.maxAssetBytes !== undefined ? Number(opts.maxAssetBytes) : undefined,
    maxSnapshotBodyBytes: opts.maxSnapshotBytes !== undefined ? Number(opts.maxSnapshotBytes) : undefined,
  }
  const config = resolveServerConfig(configOptions)

  const store = openServerStore(config.dataDir)
  clearExpiredIssuedTokens(store)

  const tlsMaterial = ensureTlsMaterial(config)
  if (tlsMaterial) config.tls = {certPath: tlsMaterial.certPath, keyPath: tlsMaterial.keyPath}
  if (tlsMaterial?.fingerprint) console.log(`Self-signed certificate fingerprint (SHA-256): ${tlsMaterial.fingerprint}`)

  const claimCode = ensureClaimCode(store)
  const identity = loadIdentity(store)
  const server = createHttpServer(store, config)

  server.listen(config.port, config.host, () => {
    const scheme = config.tls ? "https" : "http"
    console.log(`Daily Sync Server listening on ${scheme}://${config.host}:${config.port}`)

    if (claimCode) {
      console.log(`This server is unclaimed. Claim code: ${claimCode}`)
      reportPublicUrlVerification(config, identity.serverId)
    }
  })
}

/**
 * Fires the public-address check for an unclaimed server and logs the result once it settles,
 * without ever blocking `listen`. Skipped, with a line saying so, when `config.publicUrl` is
 * unset — nobody is obliged to set one on the plain in-container default.
 */
export function reportPublicUrlVerification(config: ServerConfig, expectedServerId: string): void {
  if (!config.publicUrl) {
    console.log("Public address not verified: DAILY_SERVER_PUBLIC_URL is not set.")
    return
  }

  verifyPublicUrl(config.publicUrl, expectedServerId, config.transport === "self-signed")
    .then(() => console.log(`Public address verified: ${config.publicUrl} reaches this server.`))
    .catch((err: unknown) => console.log(`Public address verification failed: ${err instanceof Error ? err.message : String(err)}`))
}
