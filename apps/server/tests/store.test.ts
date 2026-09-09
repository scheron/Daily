import {execFileSync, execSync, spawnSync} from "node:child_process"
import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {Readable} from "node:stream"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ProtocolErrorCode} from "@daily/protocol"

import pkg from "../package.json"
import {findAsset, listAssets, writeAsset} from "../src/assets/AssetStore"
import {authenticateRequest} from "../src/devices/authenticateRequest"
import {createDevice, findParentDevice, listDevices, promoteDevice, revokeDevice} from "../src/devices/DeviceStore"
import {approveEnrollment, consumeConsoleEnrollment, createConsoleEnrollment, createEnrollmentRequest} from "../src/enrollment/EnrollmentStore"
import {claimServer} from "../src/http/routes/claim"
import {ensureClaimCode, openEnrollmentWindow} from "../src/identity/ServerIdentityStore"
import {buildProgram} from "../src/index"
import {readRevision, readSnapshot, writeSnapshotIfUnchanged} from "../src/snapshot/SnapshotStore"
import {createBetterSqliteDriver} from "../src/store/betterSqliteDriver"
import {openServerStore} from "../src/store/instance"
import {runMigrations} from "../src/store/migrate"
import {v001} from "../src/store/migrations/v001-initial-schema"
import {v002} from "../src/store/migrations/v002-snapshot"
import {v003} from "../src/store/migrations/v003-assets"

import type {IncomingMessage} from "node:http"
import type {StoredSnapshotDocument} from "../src/snapshot/SnapshotStore"
import type {ServerStore} from "../src/store/instance"

function requestWithAuthorization(authorization?: string): IncomingMessage {
  return {headers: {authorization}} as IncomingMessage
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const serverDir = join(rootDir, "apps", "server")
const builtEntry = join(serverDir, "out", "index.js")
const buildServerPackageScript = join(rootDir, "scripts", "build-server-package.js")

describe("server toolchain", () => {
  // The rest of TC-1 — the bundle started by a plain `node`, migrating its SQLite and answering
  // `GET /v1/server` — cannot run here: this workspace's one `better-sqlite3` is compiled for
  // Electron's ABI, and a plain `node` can never load it. Gate B drives that half, per
  // final-gate scenario 1; this test only carries what it can check honestly, offline.
  it("TC-1: builds apps/server into a bundle at apps/server/out/index.js that prints apps/server's own version, not the root's, and resolves only bare imports apps/server itself declares", () => {
    execSync("pnpm --filter @daily/server build", {cwd: rootDir, stdio: "pipe"})

    expect(existsSync(builtEntry)).toBe(true)

    const versionOutput = execFileSync("node", [builtEntry, "--version"], {cwd: rootDir}).toString().trim()
    expect(versionOutput).toBe(pkg.version)

    const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8")) as {version: string}
    expect(versionOutput).not.toBe(rootPkg.version)

    expect(() => execFileSync("node", [buildServerPackageScript], {cwd: rootDir, stdio: "pipe"})).not.toThrow()
  }, 60000)
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
    expect(appliedAfterFirstOpen).toHaveLength(4)

    first.close()

    const second = openServerStore(dataDir)

    const identityRowsAfterSecondOpen = second.db.prepare("SELECT server_id FROM server_identity").all() as {server_id: string}[]
    expect(identityRowsAfterSecondOpen).toHaveLength(1)
    expect(identityRowsAfterSecondOpen[0].server_id).toBe(serverId)

    const appliedAfterSecondOpen = second.db.prepare("SELECT version FROM _migrations").all()
    expect(appliedAfterSecondOpen).toHaveLength(4)

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

    openEnrollmentWindow(serving)
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

describe("device roles", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-device-roles-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-1: an existing store, upgraded, gives its oldest active device the Parent role, every other device the Child role, and the database itself refuses a second Parent", () => {
    const dbPath = join(dataDir, "server.sqlite")
    const preUpgrade = createBetterSqliteDriver(dbPath)
    runMigrations(preUpgrade, [v001, v002, v003])

    const oldestActive = {id: "device-oldest-active", name: "Oldest Active Mac", createdAt: "2026-01-01T00:00:00.000Z"}
    const revoked = {id: "device-revoked", name: "Revoked Mac", createdAt: "2026-01-02T00:00:00.000Z"}
    const otherActive = {id: "device-other-active", name: "Other Active Mac", createdAt: "2026-01-03T00:00:00.000Z"}

    preUpgrade
      .prepare(`INSERT INTO devices (id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, NULL, NULL)`)
      .run(oldestActive.id, oldestActive.name, "hash-oldest-active", oldestActive.createdAt)
    preUpgrade
      .prepare(`INSERT INTO devices (id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, NULL, ?)`)
      .run(revoked.id, revoked.name, "hash-revoked", revoked.createdAt, "2026-01-05T00:00:00.000Z")
    preUpgrade
      .prepare(`INSERT INTO devices (id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, NULL, NULL)`)
      .run(otherActive.id, otherActive.name, "hash-other-active", otherActive.createdAt)

    preUpgrade.close()

    const store = openServerStore(dataDir)

    const devices = listDevices(store)
    expect(devices.find((d) => d.id === oldestActive.id)?.role).toBe("parent")
    expect(devices.find((d) => d.id === revoked.id)?.role).toBe("child")
    expect(devices.find((d) => d.id === otherActive.id)?.role).toBe("child")

    expect(() => store.db.prepare(`UPDATE devices SET role = 'parent' WHERE id = ?`).run(otherActive.id)).toThrow()
    expect(listDevices(store).find((d) => d.id === oldestActive.id)?.role).toBe("parent")

    store.close()
  })

  it("TC-2: the device that claims a fresh server is its Parent, and a device bound by approval is a Child", () => {
    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const claimed = claimServer(store, code, "MacBook Air")
    openEnrollmentWindow(store)
    const {record} = createEnrollmentRequest(store, "Mac mini")
    const approved = approveEnrollment(store, record.id, record.code, claimed.device.id)

    const devices = listDevices(store)
    expect(devices.find((d) => d.id === claimed.device.id)?.role).toBe("parent")
    expect(devices.find((d) => d.id === approved.device.id)?.role).toBe("child")

    store.close()
  })

  it("TC-3: revoking the Parent leaves no active Parent, and only then does a console enrollment take the vacant role", () => {
    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const parent = claimServer(store, code, "MacBook Air")
    openEnrollmentWindow(store)
    const {record} = createEnrollmentRequest(store, "Mac mini")
    approveEnrollment(store, record.id, record.code, parent.device.id)

    const whileParentActive = createConsoleEnrollment(store)
    const consoleWhileParentActive = consumeConsoleEnrollment(store, whileParentActive.token, "iMac")
    expect(consoleWhileParentActive.device.role).toBe("child")

    revokeDevice(store, parent.device.id)
    expect(findParentDevice(store)).toBeNull()
    expect(listDevices(store).find((d) => d.id === parent.device.id)?.role).toBe("child")

    const afterRevoke = createConsoleEnrollment(store)
    const consoleAfterRevoke = consumeConsoleEnrollment(store, afterRevoke.token, "iPad")
    expect(consoleAfterRevoke.device.role).toBe("parent")

    store.close()
  })

  it("TC-4: promoting a Child moves the role atomically, and a promotion that fails leaves every role untouched", () => {
    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const parent = claimServer(store, code, "MacBook Air")
    openEnrollmentWindow(store)
    const {record: recordA} = createEnrollmentRequest(store, "Mac mini")
    const childA = approveEnrollment(store, recordA.id, recordA.code, parent.device.id)
    openEnrollmentWindow(store)
    const {record: recordB} = createEnrollmentRequest(store, "iMac")
    const childB = approveEnrollment(store, recordB.id, recordB.code, parent.device.id)
    revokeDevice(store, childB.device.id)

    const promoted = promoteDevice(store, childA.device.id)
    expect(promoted.role).toBe("parent")

    const rolesAfterPromotion = listDevices(store)
    expect(rolesAfterPromotion.find((d) => d.id === childA.device.id)?.role).toBe("parent")
    expect(rolesAfterPromotion.find((d) => d.id === parent.device.id)?.role).toBe("child")
    expect(rolesAfterPromotion.filter((d) => d.role === "parent")).toHaveLength(1)

    try {
      promoteDevice(store, "not-a-real-device-id")
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.DEVICE_NOT_FOUND)
    }
    expect(listDevices(store)).toEqual(rolesAfterPromotion)

    try {
      promoteDevice(store, childB.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.NOT_PARENT)
    }
    expect(listDevices(store)).toEqual(rolesAfterPromotion)

    store.close()
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

  it("TC-14: device list shows each device's role with revoked ones last, promote moves the role and names both sides, and revoking the Parent warns that nobody can administer the server until one is promoted", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const parent = claimServer(store, code, "MacBook Air")
    openEnrollmentWindow(store)
    const {record: recordA} = createEnrollmentRequest(store, "Mac mini")
    const childA = approveEnrollment(store, recordA.id, recordA.code, parent.device.id)
    openEnrollmentWindow(store)
    const {record: recordB} = createEnrollmentRequest(store, "iMac")
    const childB = approveEnrollment(store, recordB.id, recordB.code, parent.device.id)
    revokeDevice(store, childB.device.id)

    await runDevice("list")
    const listingLines = logSpy.mock.calls
      .map((call) => call[0] as string)
      .join("\n")
      .split("\n")
      .filter((line) => line.trim().length > 0)
    const macBookAirLine = listingLines.find((line) => line.includes("MacBook Air"))
    const macMiniLine = listingLines.find((line) => line.includes("Mac mini"))
    const iMacLine = listingLines.find((line) => line.includes("iMac"))
    expect(macBookAirLine).toMatch(/parent/i)
    expect(macMiniLine).toMatch(/child/i)
    expect(iMacLine).toMatch(/child/i)
    expect(iMacLine).toMatch(/revoked/i)
    expect(listingLines.indexOf(iMacLine as string)).toBeGreaterThan(listingLines.indexOf(macMiniLine as string))

    logSpy.mockClear()
    await runDevice("promote", childA.device.id)
    const promoteOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(promoteOutput).toContain("Mac mini")
    expect(promoteOutput).toContain("MacBook Air")

    logSpy.mockClear()
    await runDevice("list")
    const afterPromoteLines = logSpy.mock.calls.map((call) => call[0] as string)
    const macBookAirLineAfter = afterPromoteLines.find((line) => line.includes("MacBook Air"))
    const macMiniLineAfter = afterPromoteLines.find((line) => line.includes("Mac mini"))
    expect(macBookAirLineAfter).toMatch(/child/i)
    expect(macMiniLineAfter).toMatch(/parent/i)

    logSpy.mockClear()
    await runDevice("revoke", childA.device.id)
    const revokeParentOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(revokeParentOutput).toMatch(/revoked/i)
    expect(revokeParentOutput).toContain("daily-server device promote")

    logSpy.mockRestore()
    store.close()
  })
})

describe("device ids the console can address", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-device-ids-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-24: minted device ids never begin with a character the console reads as an option, and are drawn from an alphabet without '-' or '_'", () => {
    const store = openServerStore(dataDir)

    const ids: string[] = []
    for (let i = 0; i < 5000; i++) {
      const {device} = createDevice(store, `Device ${i}`)
      ids.push(device.id)
    }

    store.close()

    expect(ids.every((id) => !id.startsWith("-"))).toBe(true)

    const alphabetUsed = new Set(ids.join(""))
    expect(alphabetUsed.has("-")).toBe(false)
    expect(alphabetUsed.has("_")).toBe(false)
  })

  /**
   * The escape hatch commander's own argument parsing already leaves open, and the only one that
   * works: options before `--data-dir`, then `--`, then the id — not the shape `runDevice` (above)
   * produces, which appends `--data-dir` after the id and cannot address one that begins with `-`.
   */
  async function runDeviceIdFirst(verb: "revoke" | "promote", id: string): Promise<void> {
    await buildProgram().parseAsync(["node", "daily-server", "device", verb, "--data-dir", dataDir, "--", id], {from: "node"})
  }

  it("TC-25: a device id beginning with '-', written directly rather than generated, is still revocable and promotable in the form that works today", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")
    claimServer(store, code, "MacBook Air")

    const {device: toRevoke} = createDevice(store, "Dashed Revoke Target")
    const {device: toPromote} = createDevice(store, "Dashed Promote Target")
    store.db.prepare(`UPDATE devices SET id = ? WHERE id = ?`).run("-dashed-revoke-target", toRevoke.id)
    store.db.prepare(`UPDATE devices SET id = ? WHERE id = ?`).run("-dashed-promote-target", toPromote.id)
    store.close()

    await runDeviceIdFirst("revoke", "-dashed-revoke-target")
    const revokeOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(revokeOutput).toMatch(/revoked/i)
    expect(revokeOutput).toContain("-dashed-revoke-target")

    logSpy.mockClear()
    await runDeviceIdFirst("promote", "-dashed-promote-target")
    const promoteOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(promoteOutput).toContain("Dashed Promote Target")
    expect(promoteOutput).toContain("is now the Parent")

    logSpy.mockRestore()

    const verify = openServerStore(dataDir)
    const devices = listDevices(verify)
    expect(devices.find((d) => d.id === "-dashed-revoke-target")?.revokedAt).toBeTruthy()
    expect(devices.find((d) => d.id === "-dashed-promote-target")?.role).toBe("parent")
    verify.close()
  })

  /**
   * Run through the real bundle, as `node` alone would run it (the "server toolchain" describe
   * above builds the same bundle for the same reason): what commander itself calls `process.exit`
   * with, and how it phrases a refusal, are only observable from outside the process an in-process
   * `parseAsync()` call runs in — this vitest worker's own `process.exit` is not the real one.
   */
  function runBuiltCli(args: string[]): {status: number | null; combined: string} {
    const result = spawnSync("node", [builtEntry, ...args], {cwd: rootDir, encoding: "utf-8"})
    return {status: result.status, combined: `${result.stdout ?? ""}\n${result.stderr ?? ""}`}
  }

  /**
   * True only if the text names the order that actually works: `--data-dir` before a standalone
   * `--`. A message that mentions `--` without ever mentioning an option first would send the
   * reader into `revoke -- <id> --data-dir <path>`, which fails with "too many arguments" — so
   * that shape must not satisfy this check.
   */
  function namesAWorkingForm(output: string): boolean {
    const dataDirIndex = output.indexOf("--data-dir")
    if (dataDirIndex === -1) return false

    const afterDataDir = output.slice(dataDirIndex + "--data-dir".length)
    return /(^|\s)--(\s|$)/.test(afterDataDir)
  }

  it("TC-26: a refusal for an id beginning with '-', given without the separator, names a form that actually works, and --help/--version are unaffected", () => {
    execSync("pnpm --filter @daily/server build", {cwd: rootDir, stdio: "pipe"})

    const refusal = runBuiltCli(["device", "revoke", "-abc123", "--data-dir", dataDir])
    expect(refusal.status).not.toBe(0)
    expect(namesAWorkingForm(refusal.combined)).toBe(true)

    const help = runBuiltCli(["--help"])
    expect(help.status).toBe(0)
    expect(help.combined).toContain("Usage:")

    const version = runBuiltCli(["--version"])
    expect(version.status).toBe(0)
    expect(version.combined.trim()).toBe(pkg.version)
  }, 60000)

  it("an unrelated commander error — an unknown command, a mistyped long option, excess arguments, a missing argument — prints no dashed-id hint", () => {
    execSync("pnpm --filter @daily/server build", {cwd: rootDir, stdio: "pipe"})

    const unknownCommand = runBuiltCli(["statsu"])
    expect(unknownCommand.status).not.toBe(0)
    expect(unknownCommand.combined).not.toContain("still works")

    const mistypedLongOption = runBuiltCli(["device", "revoke", "someid", "--dta-dir", dataDir])
    expect(mistypedLongOption.status).not.toBe(0)
    expect(mistypedLongOption.combined).not.toContain("still works")

    const excessArguments = runBuiltCli(["device", "revoke", "--", "someid", "extra", "--data-dir", dataDir])
    expect(excessArguments.status).not.toBe(0)
    expect(excessArguments.combined).not.toContain("still works")

    const missingArgument = runBuiltCli(["device", "revoke", "--data-dir", dataDir])
    expect(missingArgument.status).not.toBe(0)
    expect(missingArgument.combined).not.toContain("still works")
  }, 60000)
})

describe("snapshot store", () => {
  let dataDir: string
  let store: ServerStore

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-snapshot-"))
    store = openServerStore(dataDir)
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function snapshotDocument(overrides: Partial<StoredSnapshotDocument> = {}): StoredSnapshotDocument {
    return {
      version: 4,
      meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-1"},
      docs: {tasks: {}},
      ...overrides,
    }
  }

  it("TC-1: the first accepted write returns revision 1 and each later one advances it by exactly one", () => {
    expect(readSnapshot(store)).toBeNull()
    expect(readRevision(store)).toBeNull()

    const {device} = createDevice(store, "MacBook Air")

    const doc1 = snapshotDocument({meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-1"}})
    const rev1 = writeSnapshotIfUnchanged(store, doc1, null, device.id)
    expect(rev1).toBe("1")

    const afterFirst = readSnapshot(store)
    expect(afterFirst?.revision).toBe("1")
    expect(afterFirst?.document).toEqual(doc1)
    expect(afterFirst?.writtenByDeviceId).toBe(device.id)

    const doc2 = snapshotDocument({meta: {updatedAt: "2026-08-11T12:00:00.000Z", hash: "hash-2"}})
    const rev2 = writeSnapshotIfUnchanged(store, doc2, rev1, device.id)
    expect(rev2).toBe("2")

    const afterSecond = readSnapshot(store)
    expect(afterSecond?.revision).toBe("2")
    expect(afterSecond?.document).toEqual(doc2)
    expect(afterSecond?.hash).toBe("hash-2")
    expect(afterSecond?.updatedAt).toBe("2026-08-11T12:00:00.000Z")

    const doc3 = snapshotDocument({meta: {updatedAt: "2026-08-12T12:00:00.000Z", hash: "hash-3"}})
    const rev3 = writeSnapshotIfUnchanged(store, doc3, rev2, device.id)
    expect(rev3).toBe("3")

    const afterThird = readSnapshot(store)
    expect(afterThird?.revision).toBe("3")
    expect(afterThird?.document).toEqual(doc3)
  })

  it("TC-2: a write at a stale or null revision is refused REVISION_CONFLICT and leaves the stored row untouched", () => {
    const {device} = createDevice(store, "MacBook Air")

    writeSnapshotIfUnchanged(store, snapshotDocument({meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-1"}}), null, device.id)
    const rev2 = writeSnapshotIfUnchanged(store, snapshotDocument({meta: {updatedAt: "2026-08-11T12:00:00.000Z", hash: "hash-2"}}), "1", device.id)
    expect(rev2).toBe("2")

    const before = readSnapshot(store)

    try {
      writeSnapshotIfUnchanged(store, snapshotDocument(), "1", device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.REVISION_CONFLICT)
    }

    try {
      writeSnapshotIfUnchanged(store, snapshotDocument(), null, device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.REVISION_CONFLICT)
    }

    expect(readSnapshot(store)).toEqual(before)
  })

  it("TC-3: a write whose declared version is behind the stored one is refused, and an equal or newer version is accepted", () => {
    const {device} = createDevice(store, "MacBook Air")

    const rev1 = writeSnapshotIfUnchanged(store, snapshotDocument({version: 4}), null, device.id)
    const before = readSnapshot(store)

    try {
      writeSnapshotIfUnchanged(store, snapshotDocument({version: 3}), rev1, device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.SNAPSHOT_VERSION_BEHIND)
    }

    expect(readSnapshot(store)).toEqual(before)

    const rev2 = writeSnapshotIfUnchanged(store, snapshotDocument({version: 4}), rev1, device.id)
    expect(readSnapshot(store)?.version).toBe(4)

    writeSnapshotIfUnchanged(store, snapshotDocument({version: 5}), rev2, device.id)
    expect(readSnapshot(store)?.version).toBe(5)
  })

  it("TC-4: two connections racing a conditional write at the same expected revision produce exactly one winner", () => {
    const second = openServerStore(dataDir)

    try {
      const {device} = createDevice(store, "MacBook Air")
      const seedRevision = writeSnapshotIfUnchanged(
        store,
        snapshotDocument({meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "seed"}}),
        null,
        device.id,
      )

      const docFromStore = snapshotDocument({meta: {updatedAt: "2026-08-11T12:00:00.000Z", hash: "from-store"}})
      const docFromSecond = snapshotDocument({meta: {updatedAt: "2026-08-11T12:00:00.000Z", hash: "from-second"}})

      const winnerRevision = writeSnapshotIfUnchanged(store, docFromStore, seedRevision, device.id)
      expect(winnerRevision).toBe("2")

      try {
        writeSnapshotIfUnchanged(second, docFromSecond, seedRevision, device.id)
        expect.unreachable()
      } catch (err) {
        expect(err.code).toBe(ProtocolErrorCode.REVISION_CONFLICT)
      }

      const finalState = readSnapshot(second)
      expect(finalState?.revision).toBe("2")
      expect(finalState?.document).toEqual(docFromStore)
    } finally {
      second.close()
    }
  })
})

describe("asset store", () => {
  let dataDir: string
  let store: ServerStore

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-assets-"))
    store = openServerStore(dataDir)
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function payload(byteLength: number): Buffer {
    return Buffer.from(Array.from({length: byteLength}, (_, i) => i % 256))
  }

  it("TC-5: writing a blob lands it on disk with an index row carrying its size and sha256, even though no snapshot mentions it", async () => {
    const {device} = createDevice(store, "MacBook Air")
    const bytes = payload(4096)

    const record = await writeAsset(store, "abc123.png", Readable.from(bytes), device.id, 10 * 1024 * 1024)

    const expectedHash = createHash("sha256").update(bytes).digest("hex")
    expect(record.name).toBe("abc123.png")
    expect(record.size).toBe(bytes.length)
    expect(record.sha256).toBe(expectedHash)

    const onDisk = readFileSync(join(dataDir, "assets", "abc123.png"))
    expect(onDisk.equals(bytes)).toBe(true)

    const manifest = listAssets(store)
    expect(manifest.filter((entry) => entry.name === "abc123.png")).toHaveLength(1)

    expect(findAsset(store, "abc123.png")).toEqual(record)
  })

  it("TC-6: a re-upload replaces bytes and row in place, an oversized stream is refused cleanly, and a record survives its blob being removed from disk", async () => {
    const {device} = createDevice(store, "MacBook Air")

    const original = payload(2048)
    await writeAsset(store, "abc123.png", Readable.from(original), device.id, 10 * 1024 * 1024)

    const replacement = payload(3072)
    const replaced = await writeAsset(store, "abc123.png", Readable.from(replacement), device.id, 10 * 1024 * 1024)
    expect(replaced.sha256).toBe(createHash("sha256").update(replacement).digest("hex"))
    expect(replaced.size).toBe(replacement.length)
    expect(readFileSync(join(dataDir, "assets", "abc123.png")).equals(replacement)).toBe(true)
    expect(listAssets(store).filter((entry) => entry.name === "abc123.png")).toHaveLength(1)

    const maxBytes = 1024
    const oversized = payload(maxBytes + 1024)
    try {
      await writeAsset(store, "big.png", Readable.from(oversized), device.id, maxBytes)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.PAYLOAD_TOO_LARGE)
    }
    expect(findAsset(store, "big.png")).toBeNull()
    expect(existsSync(join(dataDir, "assets", "big.png"))).toBe(false)
    expect(readdirSync(join(dataDir, "assets")).some((entry) => entry.startsWith(".tmp-"))).toBe(false)

    unlinkSync(join(dataDir, "assets", "abc123.png"))
    expect(findAsset(store, "abc123.png")).toEqual(replaced)
    expect(listAssets(store).some((entry) => entry.name === "abc123.png")).toBe(true)
  })

  it("TC-7: every path-escaping or malformed asset name is refused, and nothing is written outside the asset directory", async () => {
    const {device} = createDevice(store, "MacBook Air")
    const invalidNames = ["../escape.png", "sub/dir.png", "noext", "a.", `${"a".repeat(65)}.png`]

    for (const name of invalidNames) {
      try {
        await writeAsset(store, name, Readable.from(payload(16)), device.id, 10 * 1024 * 1024)
        expect.unreachable()
      } catch (err) {
        expect(err.code).toBe(ProtocolErrorCode.INVALID_ASSET_NAME)
      }
    }

    expect(listAssets(store)).toHaveLength(0)
    expect(existsSync(join(dataDir, "escape.png"))).toBe(false)
    expect(existsSync(join(dataDir, "assets", "sub"))).toBe(false)
  })
})

describe("status command", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-status-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  function payload(byteLength: number): Buffer {
    return Buffer.from(Array.from({length: byteLength}, (_, i) => i % 256))
  }

  async function runStatus(targetDataDir: string): Promise<void> {
    await buildProgram().parseAsync(["node", "daily-server", "status", "--data-dir", targetDataDir], {from: "node"})
  }

  it("TC-19: status prints everything a populated store holds, and reports no snapshot or assets for a fresh one rather than failing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (code === null) throw new Error("expected an unclaimed server to have a claim code")

    const claimed = claimServer(store, code, "MacBook Air")
    const {device: second} = createDevice(store, "Mac mini")
    revokeDevice(store, second.id)

    const doc: StoredSnapshotDocument = {
      version: 7,
      meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-status"},
      docs: {tasks: {}},
    }
    writeSnapshotIfUnchanged(store, doc, null, claimed.device.id)

    await writeAsset(store, "abc123.png", Readable.from(payload(2048)), claimed.device.id, 10 * 1024 * 1024)
    await writeAsset(store, "def456.jpg", Readable.from(payload(4096)), claimed.device.id, 10 * 1024 * 1024)

    const identityRow = store.db.prepare("SELECT server_id, name FROM server_identity WHERE id = 1").get() as {
      server_id: string
      name: string
    }

    store.close()

    await runStatus(dataDir)
    const claimedOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")

    expect(claimedOutput).toContain(identityRow.name)
    expect(claimedOutput).toContain(identityRow.server_id)
    expect(claimedOutput).not.toMatch(/unclaimed/i)
    expect(claimedOutput).toMatch(/\b1\b/)
    expect(claimedOutput).toMatch(/active/i)
    expect(claimedOutput).toMatch(/revoked/i)
    expect(claimedOutput).toContain(doc.meta.updatedAt)
    expect(claimedOutput).toMatch(/\b7\b/)
    expect(claimedOutput).toMatch(/\b2\b/)

    logSpy.mockClear()

    const freshDir = mkdtempSync(join(tmpdir(), "daily-server-status-fresh-"))
    try {
      await runStatus(freshDir)
      const freshOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")

      expect(freshOutput.toLowerCase()).not.toContain("undefined")
      expect(freshOutput.toLowerCase()).not.toContain("nan")
      expect(freshOutput).not.toContain(doc.meta.updatedAt)
      expect(freshOutput).not.toContain(identityRow.server_id)
      expect(freshOutput).toMatch(/unclaimed/i)
    } finally {
      rmSync(freshDir, {recursive: true, force: true})
    }

    logSpy.mockRestore()
  })
})
