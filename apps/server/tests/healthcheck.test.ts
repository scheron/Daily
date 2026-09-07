import {mkdtempSync, rmSync} from "node:fs"
import {createServer} from "node:http"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {resolveServerConfig} from "../src/config/resolveServerConfig"
import {createHttpServer} from "../src/http/createHttpServer"
import {buildProgram} from "../src/index"
import {openServerStore} from "../src/store/instance"
import {ensureTlsMaterial} from "../src/tls/ensureTlsMaterial"

import type {Server} from "node:http"
import type {AddressInfo} from "node:net"
import type {ServerConfigOptions} from "../src/config/resolveServerConfig"
import type {ServerStore} from "../src/store/instance"

const ENV_KEYS = ["DAILY_SERVER_HOST", "DAILY_SERVER_PORT", "DAILY_SERVER_DATA_DIR", "DAILY_SERVER_TLS", "DAILY_SERVER_PUBLIC_URL"] as const

type BootedServer = {
  port: number
  store: ServerStore
  close(): Promise<void>
}

/** Boots the real HTTP(S) surface on a free loopback port, exactly as `commands/start.ts` does. */
function bootServer(dataDir: string, overrides: ServerConfigOptions = {}): Promise<BootedServer> {
  const config = resolveServerConfig({dataDir, host: "127.0.0.1", port: 0, ...overrides})

  const tlsMaterial = ensureTlsMaterial(config)
  if (tlsMaterial) config.tls = {certPath: tlsMaterial.certPath, keyPath: tlsMaterial.keyPath}

  const store = openServerStore(config.dataDir)
  const server: Server = createHttpServer(store, config)

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      const {port} = server.address() as AddressInfo
      resolve({
        port,
        store,
        close: () =>
          new Promise((res) => {
            server.close(() => {
              store.close()
              res()
            })
          }),
      })
    })
  })
}

/** A loopback port nothing is bound to: opened, read, then closed before the caller uses it. */
function pickFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, "127.0.0.1", () => {
      const {port} = probe.address() as AddressInfo
      probe.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

/**
 * Runs `daily-server healthcheck --data-dir <dataDir>` through the real `buildProgram()`, exactly
 * as `store.test.ts` drives `device` and `status`. Guarded so that before `registerHealthcheckCommand`
 * exists, this rejects with a plain assertion-style error instead of letting commander's
 * unknown-command path call `process.exit(1)` and take the whole test worker down with it.
 */
async function runHealthcheck(dataDir: string): Promise<void> {
  const program = buildProgram()
  if (!program.commands.some((command) => command.name() === "healthcheck")) {
    throw new Error('daily-server has no "healthcheck" command yet')
  }

  await program.parseAsync(["node", "daily-server", "healthcheck", "--data-dir", dataDir], {from: "node"})
}

describe("daily-server healthcheck", () => {
  let savedEnv: Record<string, string | undefined>
  let dataDir: string
  let booted: BootedServer | undefined

  beforeEach(() => {
    savedEnv = {}
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-healthcheck-"))
  })

  afterEach(async () => {
    if (booted) await booted.close()
    booted = undefined

    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-4: exits 0 against a server started on a free port with no TLS, in a temp data directory", async () => {
    booted = await bootServer(dataDir)
    process.env.DAILY_SERVER_PORT = String(booted.port)

    await runHealthcheck(dataDir)
  })

  it("TC-5: exits 1 and prints one line naming the address it could not reach when no server is listening", async () => {
    const unusedPort = await pickFreeLoopbackPort()
    process.env.DAILY_SERVER_PORT = String(unusedPort)

    let caught: unknown
    try {
      await runHealthcheck(dataDir)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    const message = (caught as Error).message
    expect(message).toContain("127.0.0.1")
    expect(message).toContain(String(unusedPort))
  })

  it("TC-6: exits 0 against a self-signed server, without tripping over its own untrusted certificate", async () => {
    process.env.DAILY_SERVER_TLS = "self-signed"
    process.env.DAILY_SERVER_PUBLIC_URL = "https://127.0.0.1"

    booted = await bootServer(dataDir)
    process.env.DAILY_SERVER_PORT = String(booted.port)

    await runHealthcheck(dataDir)
  }, 15000)
})
