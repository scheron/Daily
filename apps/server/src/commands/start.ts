import {scheduleBackups} from "../backup/scheduleBackups"
import {resolveServerConfig} from "../config/resolveServerConfig"
import {clearExpiredIssuedTokens} from "../enrollment/EnrollmentStore"
import {createHttpServer} from "../http/createHttpServer"
import {ensureClaimCode, loadIdentity} from "../identity/ServerIdentityStore"
import {openServerStore} from "../store/instance"
import {ensureTlsMaterial} from "../tls/ensureTlsMaterial"
import {verifyPublicUrl} from "../verify/verifyPublicUrl"

import type {Command} from "commander"
import type {ServerConfig, ServerConfigOptions} from "../config/resolveServerConfig"

const VERIFY_RETRY_INTERVAL_MS = 30_000
const VERIFY_RETRY_WINDOW_MS = 10 * 60_000

type StartOptions = {
  host?: string
  port?: string
  dataDir?: string
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
    .option("--max-asset-bytes <bytes>", "maximum size of a single asset upload")
    .option("--max-snapshot-bytes <bytes>", "maximum size of a snapshot write body")
    .action((opts: StartOptions) => runStart(opts))
}

function runStart(opts: StartOptions): void {
  const configOptions: ServerConfigOptions = {
    host: opts.host,
    port: opts.port !== undefined ? Number(opts.port) : undefined,
    dataDir: opts.dataDir,
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

    if (config.backup) {
      console.log(`Backups every ${config.backup.intervalMs / 3_600_000}h in ${config.backup.dir}, keeping ${config.backup.keep}.`)
      scheduleBackups(store, config.backup)
    }

    if (claimCode) {
      console.log(`This server is unclaimed. Claim code: ${claimCode}`)
      reportPublicUrlVerification(config, identity.serverId)
    }
  })
}

/**
 * Fires the public-address check for an unclaimed server and logs the result once it settles,
 * without ever blocking `listen`. A failed check is retried quietly until it passes or the
 * window runs out, so a reverse proxy wired up after this server started turns the first
 * failure into a confirmation on its own. Skipped, with a line saying so, when
 * `config.publicUrl` is unset — nobody is obliged to set one on the plain in-container default.
 */
export function reportPublicUrlVerification(config: ServerConfig, expectedServerId: string): void {
  if (!config.publicUrl) {
    console.log("Public address not verified: DAILY_SERVER_PUBLIC_URL is not set.")
    return
  }

  const publicUrl = config.publicUrl
  const allowSelfSigned = config.transport === "self-signed"
  const deadline = Date.now() + VERIFY_RETRY_WINDOW_MS

  const attempt = (isFirst: boolean): void => {
    verifyPublicUrl(publicUrl, expectedServerId, allowSelfSigned)
      .then(() => console.log(`Public address verified: ${publicUrl} reaches this server.`))
      .catch((error: unknown) => {
        if (isFirst) {
          console.log(`Public address verification failed: ${error instanceof Error ? error.message : String(error)}`)
          console.log(
            "If a reverse proxy in front of this server is not routing to it yet, that is expected on a first start: finish wiring the proxy and this check confirms the address on its own. To check by hand at any time: daily-server verify.",
          )
        }

        if (Date.now() >= deadline) {
          console.log(
            `Public address still unverified after ${VERIFY_RETRY_WINDOW_MS / 60_000} minutes. Re-check at any time with: daily-server verify.`,
          )
          return
        }

        setTimeout(() => attempt(false), VERIFY_RETRY_INTERVAL_MS).unref()
      })
  }

  attempt(true)
}
