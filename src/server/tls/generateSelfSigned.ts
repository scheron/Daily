import {execFileSync} from "node:child_process"
import {isIP} from "node:net"
import path from "node:path"
import fs from "fs-extra"

import {ServerSetupError} from "@shared/errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "@shared/errors/server/ServerSetupErrorCode"

export type GeneratedCertificate = {certPath: string; keyPath: string; fingerprint: string}

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

  return {certPath, keyPath, fingerprint: readCertificateFingerprint(certPath)}
}

/** Reads the SHA-256 fingerprint of a certificate already on disk, in `AA:BB:…` form. */
export function readCertificateFingerprint(certPath: string): string {
  const output = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-fingerprint", "-sha256"], {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString()

  const fingerprint = output.trim().split("=")[1]
  return fingerprint
}

/** The hosts a certificate is for — its `DNS:` and `IP Address:` subjectAltName entries, bare. */
export function readCertificateHosts(certPath: string): string[] {
  const output = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-ext", "subjectAltName"], {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString()

  const hosts: string[] = []
  const entryPattern = /(?:DNS|IP Address):([^,\n]+)/g
  let match: RegExpExecArray | null
  while ((match = entryPattern.exec(output)) !== null) {
    hosts.push(match[1].trim())
  }

  return hosts
}

function ensureOpensslAvailable(): void {
  try {
    execFileSync("openssl", ["version"], {stdio: "ignore"})
  } catch {
    throw new ServerSetupError(
      ServerSetupErrorCode.OPENSSL_MISSING,
      "openssl was not found on PATH. Set DAILY_SERVER_CERT and DAILY_SERVER_KEY to use your own certificate instead, or leave DAILY_SERVER_TLS unset for plain HTTP if this server is only reachable on a private network.",
    )
  }
}

function opensslErrorMessage(err: unknown): string {
  const stderr = (err as {stderr?: Buffer | string} | undefined)?.stderr
  const detail = stderr ? stderr.toString().trim() : err instanceof Error ? err.message : String(err)
  return `openssl failed to generate the certificate: ${detail}`
}
