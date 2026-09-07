import {execFileSync} from "node:child_process"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"
import {resolveServerConfig} from "@daily/server/config/resolveServerConfig"
import {createConsoleEnrollment} from "@daily/server/enrollment/EnrollmentStore"
import {createHttpServer} from "@daily/server/http/createHttpServer"
import {ensureClaimCode} from "@daily/server/identity/ServerIdentityStore"
import {openServerStore} from "@daily/server/store/instance"

import type {ClaimResponse, ConsoleEnrollResponse, IssuedCredential} from "@daily/protocol"
import type {ServerConfig, ServerConfigOptions} from "@daily/server/config/resolveServerConfig"
import type {ServerStore} from "@daily/server/store/instance"
import type {AddressInfo} from "node:net"

export type BootedSyncServer = {
  baseUrl: string
  store: ServerStore
  close(): Promise<void>
}

export type BootedHttpsSyncServer = BootedSyncServer & {
  fingerprint: string
}

/**
 * Boots a real `daily-server` over plain HTTP on `127.0.0.1`, an ephemeral port and a fresh
 * temp-directory SQLite store. `close()` closes the HTTP server, closes the store and removes
 * the temp data directory.
 */
export function bootSyncServer(overrides: ServerConfigOptions = {}): Promise<BootedSyncServer> {
  const dataDir = overrides.dataDir ?? mkdtempSync(join(tmpdir(), "daily-sync-server-"))
  const config = resolveServerConfig({host: "127.0.0.1", port: 0, ...overrides, dataDir})

  return startServer(config, dataDir)
}

/**
 * Same as {@link bootSyncServer}, over HTTPS: generates a self-signed certificate and key with
 * the system `openssl` into the same temp directory and reads the certificate's true SHA-256
 * fingerprint independently of anything the client or the probe reads off the live socket. No
 * private key is checked into the repository.
 */
export function bootHttpsSyncServer(overrides: ServerConfigOptions = {}): Promise<BootedHttpsSyncServer> {
  const dataDir = overrides.dataDir ?? mkdtempSync(join(tmpdir(), "daily-sync-server-https-"))
  const {certPath, keyPath, fingerprint} = generateSelfSignedCertificate(dataDir)
  const base = resolveServerConfig({host: "127.0.0.1", port: 0, ...overrides, dataDir})
  const config: ServerConfig = {...base, tls: {certPath, keyPath}, transport: "self-signed"}

  return startServer(config, dataDir).then((server) => ({...server, fingerprint}))
}

/**
 * Claims an unclaimed server with its console claim code, binding the first device.
 */
export async function claimFirstDevice(server: BootedSyncServer, deviceName = "MacBook Air"): Promise<IssuedCredential> {
  const code = ensureClaimCode(server.store)
  if (!code) throw new Error("Expected an unclaimed test server to hold a claim code")

  const response = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
    method: "POST",
    body: JSON.stringify({code, deviceName}),
  })
  if (!response.ok) throw new Error(`Could not claim the test server: ${response.status} ${await response.text()}`)

  return ((await response.json()) as {ok: true; data: ClaimResponse}).data
}

/**
 * Binds a second device to an already-claimed server through a console enrollment token,
 * bypassing the peer-approval flow.
 */
export async function enrollSecondDevice(server: BootedSyncServer, deviceName: string): Promise<IssuedCredential> {
  const issued = createConsoleEnrollment(server.store)

  const response = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
    method: "POST",
    body: JSON.stringify({token: issued.token, deviceName}),
  })
  if (!response.ok) throw new Error(`Could not enroll a second test device: ${response.status} ${await response.text()}`)

  return ((await response.json()) as {ok: true; data: ConsoleEnrollResponse}).data
}

function startServer(config: ServerConfig, dataDir: string): Promise<BootedSyncServer> {
  const store = openServerStore(config.dataDir)
  const server = createHttpServer(store, config)

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      const {port} = server.address() as AddressInfo
      const scheme = config.tls ? "https" : "http"

      resolve({
        baseUrl: `${scheme}://${config.host}:${port}`,
        store,
        close: () =>
          new Promise((res) => {
            server.close(() => {
              store.close()
              rmSync(dataDir, {recursive: true, force: true})
              res()
            })
          }),
      })
    })
  })
}

function generateSelfSignedCertificate(dataDir: string): {certPath: string; keyPath: string; fingerprint: string} {
  const certPath = join(dataDir, "cert.pem")
  const keyPath = join(dataDir, "key.pem")

  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650", "-subj", "/CN=localhost", "-keyout", keyPath, "-out", certPath],
    {stdio: "ignore"},
  )

  return {certPath, keyPath, fingerprint: readCertificateFingerprint(certPath)}
}

function readCertificateFingerprint(certPath: string): string {
  const output = execFileSync("openssl", ["x509", "-noout", "-fingerprint", "-sha256", "-in", certPath]).toString("utf8")
  const match = /Fingerprint=([0-9A-Fa-f:]+)/.exec(output)
  if (!match) throw new Error(`Could not read a SHA-256 fingerprint from ${certPath}`)

  return match[1].trim().toUpperCase()
}
