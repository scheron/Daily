import {X509Certificate} from "node:crypto"
import fs from "node:fs"
import {isIP} from "node:net"
import path from "node:path"

import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"
import {generateSelfSignedCertificate} from "./generateSelfSigned"

import type {ServerConfig} from "../config/resolveServerConfig"

type TlsMaterial = {certPath: string; keyPath: string; fingerprint: string | null}

/**
 * Reuses a self-signed certificate only when its subject alternative names include the public URL's exact host.
 * A certificate covering a different host stays on disk and prevents startup.
 */
export function ensureTlsMaterial(config: ServerConfig): TlsMaterial | null {
  if (config.transport === "self-signed") return ensureSelfSignedMaterial(config)
  return null
}

function ensureSelfSignedMaterial(config: ServerConfig): TlsMaterial {
  if (!config.publicUrl) throw new Error("ensureTlsMaterial: self-signed transport without a public URL")

  const hostname = new URL(config.publicUrl).hostname
  const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname
  const tlsDir = path.resolve(config.dataDir, "tls")
  const certPath = path.join(tlsDir, "cert.pem")
  const keyPath = path.join(tlsDir, "key.pem")

  if (fs.existsSync(certPath)) {
    const certificate = new X509Certificate(fs.readFileSync(certPath))
    const matchedHost = isIP(host) ? certificate.checkIP(host) : certificate.checkHost(host, {subject: "never", wildcards: false})
    if (matchedHost !== host) {
      throw new ServerSetupError(
        ServerSetupErrorCode.CERTIFICATE_FAILED,
        `The certificate at ${certPath} covers ${certificate.subjectAltName || "no host"}, not ${host}, and will not be replaced automatically. Delete it to mint a new one, or point DAILY_SERVER_PUBLIC_URL back at the host it already covers.`,
      )
    }

    return {certPath, keyPath, fingerprint: certificate.fingerprint256}
  }

  const generated = generateSelfSignedCertificate(config.dataDir, host)
  return {certPath: generated.certPath, keyPath: generated.keyPath, fingerprint: generated.fingerprint}
}
