import fs from "node:fs"
import path from "node:path"

import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"
import {generateSelfSignedCertificate, readCertificateFingerprint, readCertificateHosts} from "./generateSelfSigned"

import type {ServerConfig} from "../config/resolveServerConfig"

export type TlsMaterial = {certPath: string; keyPath: string; fingerprint: string | null}

/**
 * Resolves the TLS material `createHttpServer` should be given for `config.transport`: `null`
 * for plain HTTP, the configured pair as-is for `own-certificate`, and for `self-signed` a
 * certificate under `<dataDir>/tls/` — reused when it already covers the public URL's host,
 * minted with `generateSelfSignedCertificate` when the directory is empty. A certificate on disk
 * covering a different host refuses rather than being replaced.
 */
export function ensureTlsMaterial(config: ServerConfig): TlsMaterial | null {
  if (config.transport === "self-signed") return ensureSelfSignedMaterial(config)
  if (!config.tls) return null

  return {certPath: config.tls.certPath, keyPath: config.tls.keyPath, fingerprint: null}
}

function ensureSelfSignedMaterial(config: ServerConfig): TlsMaterial {
  if (!config.publicUrl) throw new Error("ensureTlsMaterial: self-signed transport without a public URL")

  const host = new URL(config.publicUrl).hostname
  const tlsDir = path.resolve(config.dataDir, "tls")
  const certPath = path.join(tlsDir, "cert.pem")
  const keyPath = path.join(tlsDir, "key.pem")

  if (fs.existsSync(certPath)) {
    const hosts = readCertificateHosts(certPath)
    if (!hosts.includes(host)) {
      throw new ServerSetupError(
        ServerSetupErrorCode.CERTIFICATE_FAILED,
        `The certificate at ${certPath} covers ${hosts.join(", ") || "no host"}, not ${host}, and will not be replaced automatically. Delete it to mint a new one, or point DAILY_SERVER_PUBLIC_URL back at the host it already covers.`,
      )
    }

    return {certPath, keyPath, fingerprint: readCertificateFingerprint(certPath)}
  }

  const generated = generateSelfSignedCertificate(config.dataDir, host)
  return {certPath: generated.certPath, keyPath: generated.keyPath, fingerprint: generated.fingerprint}
}
