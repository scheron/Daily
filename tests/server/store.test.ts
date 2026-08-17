import {execFileSync, execSync} from "node:child_process"
import {existsSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"

import {authenticateRequest} from "@server/devices/authenticateRequest"
import {createDevice, listDevices, revokeDevice} from "@server/devices/DeviceStore"
import {approveEnrollment, createEnrollmentRequest} from "@server/enrollment/EnrollmentStore"
import {claimServer} from "@server/http/routes/claim"
import {ensureClaimCode} from "@server/identity/ServerIdentityStore"
import {buildProgram} from "@server/index"
import {openServerStore} from "@server/store/instance"
import pkg from "../../package.json"

import type {IncomingMessage} from "node:http"

function requestWithAuthorization(authorization?: string): IncomingMessage {
  return {headers: {authorization}} as IncomingMessage
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const builtEntry = join(rootDir, "out/server/index.js")

describe("server toolchain", () => {
  it("TC-1: builds src/server into a runnable entry that prints the package version", () => {
    execSync("pnpm build:server", {cwd: rootDir, stdio: "pipe"})

    expect(existsSync(builtEntry)).toBe(true)

    const output = execFileSync("node", [builtEntry, "--version"], {cwd: rootDir}).toString().trim()

    expect(output).toBe(pkg.version)
  }, 30000)
})

describe("server store", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-store-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-2: creates the v1 schema and one identity row on first open; a second open applies nothing new", () => {
    const first = openServerStore(dataDir)

    const identityRows = first.db.prepare("SELECT server_id, name FROM server_identity").all() as {server_id: string; name: string}[]
    expect(identityRows).toHaveLength(1)
    expect(identityRows[0].server_id).toBeTruthy()
    expect(identityRows[0].name).toBeTruthy()
    const serverId = identityRows[0].server_id

    const appliedAfterFirstOpen = first.db.prepare("SELECT version FROM _migrations").all()
    expect(appliedAfterFirstOpen).toHaveLength(1)

    first.close()

    const second = openServerStore(dataDir)

    const identityRowsAfterSecondOpen = second.db.prepare("SELECT server_id FROM server_identity").all() as {server_id: string}[]
    expect(identityRowsAfterSecondOpen).toHaveLength(1)
    expect(identityRowsAfterSecondOpen[0].server_id).toBe(serverId)

    const appliedAfterSecondOpen = second.db.prepare("SELECT version FROM _migrations").all()
    expect(appliedAfterSecondOpen).toHaveLength(1)

    second.close()
  })
})

describe("device credentials", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-devices-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-5: a valid token authenticates and moves last_seen_at forward; no token, an unissued token and a revoked device's token are refused; the plaintext token is stored nowhere", () => {
    const store = openServerStore(dataDir)
    const {device, token} = createDevice(store, "MacBook Air")

    try {
      authenticateRequest(store, requestWithAuthorization(undefined))
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.UNAUTHORIZED)
    }

    try {
      authenticateRequest(store, requestWithAuthorization("Bearer not-a-real-token"))
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.UNAUTHORIZED)
    }

    const authenticated = authenticateRequest(store, requestWithAuthorization(`Bearer ${token}`))
    expect(authenticated.id).toBe(device.id)
    expect(authenticated.name).toBe(device.name)
    expect(authenticated.revokedAt).toBeNull()
    expect(authenticated.lastSeenAt).toBeTruthy()

    const persisted = listDevices(store).find((d) => d.id === device.id)
    expect(persisted?.lastSeenAt).toBe(authenticated.lastSeenAt)

    const revoked = revokeDevice(store, device.id)
    expect(revoked?.revokedAt).toBeTruthy()

    try {
      authenticateRequest(store, requestWithAuthorization(`Bearer ${token}`))
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.DEVICE_REVOKED)
    }

    const tables = store.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as {
      name: string
    }[]

    for (const {name} of tables) {
      const rows = store.db.prepare(`SELECT * FROM "${name}"`).all()
      expect(JSON.stringify(rows)).not.toContain(token)
    }

    store.close()
  })
})

describe("two connections to one database", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-connections-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-13: a claim and an approval each bind exactly one device, whichever connection asks second", () => {
    const serving = openServerStore(dataDir)
    const consoleSide = openServerStore(dataDir)

    const code = ensureClaimCode(serving)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const claimed = claimServer(serving, code, "MacBook Air")

    try {
      claimServer(consoleSide, code, "Mac mini")
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.ALREADY_CLAIMED)
    }

    expect(listDevices(consoleSide)).toHaveLength(1)

    const {record} = createEnrollmentRequest(serving, "Mac mini")
    const approved = approveEnrollment(serving, record.id, record.code, claimed.device.id)

    try {
      approveEnrollment(consoleSide, record.id, record.code, claimed.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.ENROLLMENT_NOT_PENDING)
    }

    const devices = listDevices(consoleSide)
    expect(devices).toHaveLength(2)
    expect(devices.filter((device) => device.id === approved.device.id)).toHaveLength(1)

    const row = consoleSide.db.prepare(`SELECT issued_device_id FROM enrollment_requests WHERE id = ?`).get(record.id) as {
      issued_device_id: string
    }
    expect(row.issued_device_id).toBe(approved.device.id)

    serving.close()
    consoleSide.close()
  })
})

describe("device management console", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-device-console-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function runDevice(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(["node", "daily-server", "device", ...args, "--data-dir", dataDir], {from: "node"})
  }

  it("TC-12: device list shows every device active, revoke stops it without deleting the row, and revoking the last active device warns instead of refusing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const first = claimServer(store, code, "MacBook Air")
    const {device: second, token: secondToken} = createDevice(store, "Mac mini")
    authenticateRequest(store, requestWithAuthorization(`Bearer ${first.token}`))
    authenticateRequest(store, requestWithAuthorization(`Bearer ${secondToken}`))

    const secondLastSeen = listDevices(store).find((d) => d.id === second.id)?.lastSeenAt
    if (!secondLastSeen) throw new Error("expected Mac mini to have a last-seen time")

    await runDevice("list")
    const firstListing = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(firstListing).toContain("MacBook Air")
    expect(firstListing).toContain("Mac mini")
    expect(firstListing).toContain(secondLastSeen)
    expect(firstListing).not.toMatch(/revoked/i)

    logSpy.mockClear()
    await runDevice("revoke", second.id)
    expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toMatch(/revoked/i)

    logSpy.mockClear()
    await runDevice("list")
    const secondListing = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(secondListing).toContain("Mac mini")
    expect(secondListing).toMatch(/revoked/i)

    const devicesAfterRevoke = listDevices(store)
    expect(devicesAfterRevoke.find((d) => d.id === second.id)).toBeTruthy()

    try {
      authenticateRequest(store, requestWithAuthorization(`Bearer ${secondToken}`))
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.DEVICE_REVOKED)
    }

    expect(authenticateRequest(store, requestWithAuthorization(`Bearer ${first.token}`)).id).toBe(first.device.id)

    logSpy.mockClear()
    await runDevice("revoke", first.device.id)
    const lastRevokeOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(lastRevokeOutput).toMatch(/revoked/i)
    expect(lastRevokeOutput).toContain("daily-server device enroll")

    logSpy.mockRestore()
    store.close()
  })
})
