import {execFileSync} from "node:child_process"
import {X509Certificate} from "node:crypto"
import {isIP} from "node:net"
import path from "node:path"
import fs from "fs-extra"

import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"

type GeneratedCertificate = {certPath: string; keyPath: string; fingerprint: string}

const CERT_DAYS = 3650

/**
 * Mints a self-signed P-256 certificate for `host` under `<dataDir>/tls/`, and returns its paths
 * and SHA-256 fingerprint.
 */
export function generateSelfSignedCertificate(dataDir: string, host: string): GeneratedCertificate {
  ensureOpensslAvailable()

  const tlsDir = path.join(dataDir, "tls")
  fs.ensureDirSync(tlsDir, {mode: 0o700})
  fs.chmodSync(tlsDir, 0o700)

  const certPath = path.join(tlsDir, "cert.pem")
  const keyPath = path.join(tlsDir, "key.pem")
  const sanEntry = isIP(host) ? `IP:${host}` : `DNS:${host}`

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-nodes",
        "-days",
        String(CERT_DAYS),
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:P-256",
        // LibreSSL defaults to explicit curve parameters, which Electron TLS cannot decode.
        "-pkeyopt",
        "ec_param_enc:named_curve",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-subj",
        `/CN=${host}`,
        "-addext",
        `subjectAltName=${sanEntry}`,
      ],
      {stdio: ["ignore", "ignore", "pipe"]},
    )
  } catch (err) {
    throw new ServerSetupError(ServerSetupErrorCode.CERTIFICATE_FAILED, opensslErrorMessage(err))
  }

  fs.chmodSync(certPath, 0o600)
  fs.chmodSync(keyPath, 0o600)

  const certificate = new X509Certificate(fs.readFileSync(certPath))
  return {certPath, keyPath, fingerprint: certificate.fingerprint256}
}

function ensureOpensslAvailable(): void {
  try {
    execFileSync("openssl", ["version"], {stdio: "ignore"})
  } catch {
    throw new ServerSetupError(
      ServerSetupErrorCode.OPENSSL_MISSING,
      "openssl was not found on PATH. Install openssl to mint a self-signed certificate, or leave DAILY_SERVER_TLS unset for plain HTTP if this server is only reachable on a private network.",
    )
  }
}

function opensslErrorMessage(err: unknown): string {
  const stderr = (err as {stderr?: Buffer | string} | undefined)?.stderr
  const detail = stderr ? stderr.toString().trim() : err instanceof Error ? err.message : String(err)
  return `openssl failed to generate the certificate: ${detail}`
}
