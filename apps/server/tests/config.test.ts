import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {resolveServerConfig} from "../src/config/resolveServerConfig"
import {ServerSetupError} from "../src/errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../src/errors/server/ServerSetupErrorCode"

const ENV_KEYS = [
  "DAILY_SERVER_HOST",
  "DAILY_SERVER_PORT",
  "DAILY_SERVER_DATA_DIR",
  "DAILY_SERVER_CERT",
  "DAILY_SERVER_KEY",
  "DAILY_SERVER_MAX_ASSET_BYTES",
  "DAILY_SERVER_MAX_SNAPSHOT_BYTES",
  "DAILY_SERVER_PUBLIC_URL",
  "DAILY_SERVER_TLS",
] as const

/** Calls `fn` once, returns whatever it throws, and fails the test if it does not throw. */
function captureError(fn: () => void): unknown {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error("expected fn to throw, and it did not")
}

function expectServerSetupError(fn: () => void, code: ServerSetupErrorCode): ServerSetupError {
  const err = captureError(fn)
  expect(err).toBeInstanceOf(ServerSetupError)
  expect((err as ServerSetupError).code).toBe(code)
  return err as ServerSetupError
}

describe("resolveServerConfig", () => {
  let savedEnv: Record<string, string | undefined>
  let dataDir: string

  beforeEach(() => {
    savedEnv = {}
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-config-"))
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-2: with no DAILY_SERVER_* variable set and no configuration file anywhere, resolves the plain defaults", () => {
    const config = resolveServerConfig({})

    expect(config.host).toBe("0.0.0.0")
    expect(config.port).toBe(8787)
    expect(config.transport).toBe("plain")
    expect(config.tls).toBeNull()
    expect(config.publicUrl).toBeNull()
  })

  it("TC-3: DAILY_SERVER_CERT and DAILY_SERVER_KEY both set resolve to the own-certificate transport, carrying both paths", () => {
    process.env.DAILY_SERVER_CERT = "/fixtures/cert.pem"
    process.env.DAILY_SERVER_KEY = "/fixtures/key.pem"

    const config = resolveServerConfig({})

    expect(config.transport).toBe("own-certificate")
    expect(config.tls).toEqual({certPath: "/fixtures/cert.pem", keyPath: "/fixtures/key.pem"})
  })

  it("TC-4: a config.json in the data directory is ignored entirely — the result is the same as with no file at all", () => {
    writeFileSync(
      join(dataDir, "config.json"),
      JSON.stringify({host: "203.0.113.9", port: 1, transport: "self-signed", publicUrl: "https://example.test"}),
      "utf-8",
    )

    const config = resolveServerConfig({dataDir})

    expect(config.host).toBe("0.0.0.0")
    expect(config.port).toBe(8787)
    expect(config.transport).toBe("plain")
    expect(config.tls).toBeNull()
    expect(config.publicUrl).toBeNull()
  })

  it("TC-5: DAILY_SERVER_TLS=self-signed with no DAILY_SERVER_PUBLIC_URL throws INVALID_ENVIRONMENT naming the missing variable", () => {
    process.env.DAILY_SERVER_TLS = "self-signed"

    const err = expectServerSetupError(() => resolveServerConfig({}), ServerSetupErrorCode.INVALID_ENVIRONMENT)
    expect(err.message).toContain("DAILY_SERVER_PUBLIC_URL")
  })

  it("TC-6: DAILY_SERVER_TLS=self-signed together with DAILY_SERVER_CERT and DAILY_SERVER_KEY throws INVALID_ENVIRONMENT naming all three variables", () => {
    process.env.DAILY_SERVER_TLS = "self-signed"
    process.env.DAILY_SERVER_CERT = "/fixtures/cert.pem"
    process.env.DAILY_SERVER_KEY = "/fixtures/key.pem"

    const err = expectServerSetupError(() => resolveServerConfig({}), ServerSetupErrorCode.INVALID_ENVIRONMENT)
    expect(err.message).toContain("DAILY_SERVER_TLS")
    expect(err.message).toContain("DAILY_SERVER_CERT")
    expect(err.message).toContain("DAILY_SERVER_KEY")
  })

  it("TC-7: DAILY_SERVER_TLS set to a value that is neither plain nor self-signed throws INVALID_ENVIRONMENT naming the variable and the two accepted values", () => {
    process.env.DAILY_SERVER_TLS = "insecure-public"

    const err = expectServerSetupError(() => resolveServerConfig({}), ServerSetupErrorCode.INVALID_ENVIRONMENT)
    expect(err.message).toContain("DAILY_SERVER_TLS")
    expect(err.message).toContain("plain")
    expect(err.message).toContain("self-signed")
  })
})
