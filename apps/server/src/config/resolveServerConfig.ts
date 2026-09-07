import path from "node:path"

import {SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"

export type ServerTransportChoice = "plain" | "self-signed"

export type ServerConfigOptions = {
  host?: string
  port?: number
  dataDir?: string
  maxAssetBytes?: number
  maxSnapshotBodyBytes?: number
}
export type ServerConfig = {
  host: string
  port: number
  dataDir: string
  tls: {certPath: string; keyPath: string} | null
  maxAssetBytes: number
  maxSnapshotBodyBytes: number
  publicUrl: string | null
  transport: ServerTransportChoice
}

/**
 * Resolves the server's runtime configuration from explicit options, then environment
 * variables, then the protocol defaults. Pure over its inputs — no filesystem or database
 * access, and no check that a given certificate, key or data path exists.
 */
export function resolveServerConfig(options: ServerConfigOptions): ServerConfig {
  const host = options.host ?? process.env.DAILY_SERVER_HOST ?? SYNC_PROTOCOL_CONFIG.defaultHost
  const port = options.port ?? envPort() ?? SYNC_PROTOCOL_CONFIG.defaultPort
  const dataDir = options.dataDir ?? process.env.DAILY_SERVER_DATA_DIR ?? defaultDataDir()
  const maxAssetBytes = options.maxAssetBytes ?? envMaxAssetBytes() ?? SYNC_PROTOCOL_CONFIG.maxAssetBytes
  const maxSnapshotBodyBytes = options.maxSnapshotBodyBytes ?? envMaxSnapshotBodyBytes() ?? SYNC_PROTOCOL_CONFIG.maxSnapshotBodyBytes

  const publicUrl = process.env.DAILY_SERVER_PUBLIC_URL ?? null
  const transport = resolveTransport(process.env.DAILY_SERVER_TLS, publicUrl)

  return {
    host,
    port,
    dataDir,
    tls: null,
    maxAssetBytes,
    maxSnapshotBodyBytes,
    publicUrl,
    transport,
  }
}

function resolveTransport(tlsChoice: string | undefined, publicUrl: string | null): ServerTransportChoice {
  if (tlsChoice !== undefined && tlsChoice !== "plain" && tlsChoice !== "self-signed") {
    throw new ServerSetupError(ServerSetupErrorCode.INVALID_ENVIRONMENT, `DAILY_SERVER_TLS must be "plain" or "self-signed", got "${tlsChoice}"`)
  }

  if (tlsChoice === "self-signed") {
    if (!publicUrl) {
      throw new ServerSetupError(
        ServerSetupErrorCode.INVALID_ENVIRONMENT,
        "DAILY_SERVER_TLS=self-signed needs DAILY_SERVER_PUBLIC_URL: a self-signed certificate must name the host it covers",
      )
    }
    return "self-signed"
  }

  return "plain"
}

function envPort(): number | undefined {
  const raw = process.env.DAILY_SERVER_PORT
  if (!raw) return undefined

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function envMaxAssetBytes(): number | undefined {
  const raw = process.env.DAILY_SERVER_MAX_ASSET_BYTES
  if (!raw) return undefined

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function envMaxSnapshotBodyBytes(): number | undefined {
  const raw = process.env.DAILY_SERVER_MAX_SNAPSHOT_BYTES
  if (!raw) return undefined

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function defaultDataDir(): string {
  const root = process.env.XDG_DATA_HOME || path.join(process.env.HOME ?? "", ".local", "share")
  return path.join(root, "daily-server")
}
