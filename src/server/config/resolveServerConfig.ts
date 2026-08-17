import path from "node:path"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"

export type ServerConfigOptions = {host?: string; port?: number; dataDir?: string; cert?: string; key?: string}
export type ServerConfig = {host: string; port: number; dataDir: string; tls: {certPath: string; keyPath: string} | null}

/**
 * Resolves the server's runtime configuration from explicit options, then environment
 * variables, then the protocol defaults. Pure over its inputs — no filesystem or database
 * access, and no check that a given certificate or key path exists.
 */
export function resolveServerConfig(options: ServerConfigOptions): ServerConfig {
  const host = options.host ?? process.env.DAILY_SERVER_HOST ?? SYNC_PROTOCOL_CONFIG.defaultHost
  const port = options.port ?? envPort() ?? SYNC_PROTOCOL_CONFIG.defaultPort
  const dataDir = options.dataDir ?? process.env.DAILY_SERVER_DATA_DIR ?? defaultDataDir()

  const certPath = options.cert ?? process.env.DAILY_SERVER_CERT
  const keyPath = options.key ?? process.env.DAILY_SERVER_KEY

  if (Boolean(certPath) !== Boolean(keyPath)) {
    throw new Error("--cert and --key must be given together")
  }

  return {
    host,
    port,
    dataDir,
    tls: certPath && keyPath ? {certPath, keyPath} : null,
  }
}

function envPort(): number | undefined {
  const raw = process.env.DAILY_SERVER_PORT
  if (!raw) return undefined

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function defaultDataDir(): string {
  const root = process.env.XDG_DATA_HOME || path.join(process.env.HOME ?? "", ".local", "share")
  return path.join(root, "daily-server")
}
