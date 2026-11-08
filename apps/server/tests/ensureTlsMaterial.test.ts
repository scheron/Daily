import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {ServerSetupError} from "../src/errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../src/errors/server/ServerSetupErrorCode"
import {ensureTlsMaterial} from "../src/tls/ensureTlsMaterial"

import type {ServerConfig} from "../src/config/resolveServerConfig"

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
      name: null,
      derivedName: null,
      transport: "plain",
      backup: null,
      ...overrides,
    }
  }

  it("plain transport resolves to no TLS material", () => {
    expect(ensureTlsMaterial(config({transport: "plain"}))).toBeNull()
  })

  it.each(["https://example.test:8787", "https://192.0.2.1", "https://[2001:db8::1]"])(
    "mints and reuses a self-signed certificate with the same fingerprint for %s",
    (publicUrl) => {
      const cfg = config({transport: "self-signed", publicUrl})

      const first = ensureTlsMaterial(cfg)
      const second = ensureTlsMaterial(cfg)

      expect(first?.certPath).toBe(join(dataDir, "tls", "cert.pem"))
      expect(first?.fingerprint).toBeTruthy()
      expect(second).toEqual(first)
    },
    15000,
  )

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
