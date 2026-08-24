import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {ServerSetupError} from "../src/errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../src/errors/server/ServerSetupErrorCode"
import {ensureTlsMaterial} from "../src/tls/ensureTlsMaterial"

import type {ServerConfig} from "../src/config/resolveServerConfig"

/** Calls `fn` once, returns whatever it throws, and fails the test if it does not throw. */
function captureError(fn: () => void): unknown {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error("expected fn to throw, and it did not")
}

describe("ensureTlsMaterial", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-tls-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  function config(overrides: Partial<ServerConfig>): ServerConfig {
    return {
      host: "0.0.0.0",
      port: 8787,
      dataDir,
      tls: null,
      maxAssetBytes: 1,
      maxSnapshotBodyBytes: 1,
      publicUrl: null,
      transport: "plain",
      ...overrides,
    }
  }

  it("plain transport resolves to no TLS material", () => {
    expect(ensureTlsMaterial(config({transport: "plain"}))).toBeNull()
  })

  it("own-certificate transport passes the configured pair through untouched, with no fingerprint to pin", () => {
    const material = ensureTlsMaterial(config({transport: "own-certificate", tls: {certPath: "/fixtures/cert.pem", keyPath: "/fixtures/key.pem"}}))

    expect(material).toEqual({certPath: "/fixtures/cert.pem", keyPath: "/fixtures/key.pem", fingerprint: null})
  })

  it("self-signed mints a certificate under <dataDir>/tls/ on the first call, and reuses it with the same fingerprint on the next", () => {
    const cfg = config({transport: "self-signed", publicUrl: "https://example.test:8787"})

    const first = ensureTlsMaterial(cfg)
    const second = ensureTlsMaterial(cfg)

    expect(first?.certPath).toBe(join(dataDir, "tls", "cert.pem"))
    expect(first?.fingerprint).toBeTruthy()
    expect(second?.certPath).toBe(first?.certPath)
    expect(second?.fingerprint).toBe(first?.fingerprint)
  }, 15000)

  it("refuses a certificate on disk covering a different host, naming both hosts and the absolute certificate path", () => {
    ensureTlsMaterial(config({transport: "self-signed", publicUrl: "https://old-host.example.test"}))

    const err = captureError(() => ensureTlsMaterial(config({transport: "self-signed", publicUrl: "https://new-host.example.test"})))

    expect(err).toBeInstanceOf(ServerSetupError)
    expect((err as ServerSetupError).code).toBe(ServerSetupErrorCode.CERTIFICATE_FAILED)
    expect((err as ServerSetupError).message).toContain("old-host.example.test")
    expect((err as ServerSetupError).message).toContain("new-host.example.test")
    expect((err as ServerSetupError).message).toContain(join(dataDir, "tls", "cert.pem"))
  }, 15000)
})
