import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Readable} from "node:stream"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ProtocolErrorCode} from "@daily/protocol"

import {
  approveAgentRequest,
  createAgentRequest,
  denyAgentRequest,
  findPendingAgentRequest,
  listAgents,
  openAgentWindow,
  readAgentRequest,
} from "../src/agents/AgentStore"
import {findAsset, listAssets, writeAsset} from "../src/assets/AssetStore"
import {authenticateRequest} from "../src/devices/authenticateRequest"
import {createDevice, findParentDevice, listDevices, promoteDevice, revokeDevice} from "../src/devices/DeviceStore"
import {approveEnrollment, consumeConsoleEnrollment, createConsoleEnrollment, createEnrollmentRequest} from "../src/enrollment/EnrollmentStore"
import {claimServer} from "../src/http/routes/claim"
import {applyFallbackName, applyServerName, ensureClaimCode, loadIdentity, openEnrollmentWindow} from "../src/identity/ServerIdentityStore"
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
    expect(appliedAfterFirstOpen).toHaveLength(6)

    first.close()

    const second = openServerStore(dataDir)

    const identityRowsAfterSecondOpen = second.db.prepare("SELECT server_id FROM server_identity").all() as {server_id: string}[]
    expect(identityRowsAfterSecondOpen).toHaveLength(1)
    expect(identityRowsAfterSecondOpen[0].server_id).toBe(serverId)

    const appliedAfterSecondOpen = second.db.prepare("SELECT version FROM _migrations").all()
    expect(appliedAfterSecondOpen).toHaveLength(6)

    second.close()
  })
})

describe("the server's name", () => {
  let dataDir: string
  let store: ServerStore

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-name-"))
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("names the identity row after the given name when the row is born here, so a fresh install never wears a container id", () => {
    store = openServerStore(dataDir, "daily.example.test")

    expect(loadIdentity(store).name).toBe("daily.example.test")
  })

  it("falls back to the host's own name when the row is born without one", () => {
    store = openServerStore(dataDir)

    expect(loadIdentity(store).name).toBeTruthy()
  })

  it("renames a row that already exists and reports the name it replaced", () => {
    store = openServerStore(dataDir, "ddf5d06d6d7b")

    expect(applyServerName(store, "daily.example.test")).toBe("ddf5d06d6d7b")
    expect(loadIdentity(store).name).toBe("daily.example.test")
  })

  it("reports null and writes nothing when the row already carries that name, so a restart is silent", () => {
    store = openServerStore(dataDir, "daily.example.test")

    expect(applyServerName(store, "daily.example.test")).toBeNull()
    expect(loadIdentity(store).name).toBe("daily.example.test")
  })

  it("lets the fallback replace a bare container id, because nobody chose that name", () => {
    store = openServerStore(dataDir, "ddf5d06d6d7b")

    expect(applyFallbackName(store, "daily.example.test")).toBe("ddf5d06d6d7b")
    expect(loadIdentity(store).name).toBe("daily.example.test")
  })

  it("refuses to let the fallback touch a name someone chose, so a rename survives every restart", () => {
    store = openServerStore(dataDir, "ddf5d06d6d7b")
    applyServerName(store, "My server")

    expect(applyFallbackName(store, "daily.example.test")).toBeNull()
    expect(loadIdentity(store).name).toBe("My server")
  })

  it("treats a name that merely looks hex-ish as chosen — only the exact twelve characters count", () => {
    store = openServerStore(dataDir, "ddf5d06d6d7")

    expect(applyFallbackName(store, "daily.example.test")).toBeNull()
    expect(loadIdentity(store).name).toBe("ddf5d06d6d7")
  })

  it("leaves a derived name alone on the next start, so the fallback does not chase a changed address", () => {
    store = openServerStore(dataDir, "daily.example.test")

    expect(applyFallbackName(store, "other.example.test")).toBeNull()
    expect(loadIdentity(store).name).toBe("daily.example.test")
  })

  it("leaves the server id alone when the name moves", () => {
    store = openServerStore(dataDir, "ddf5d06d6d7b")
    const serverId = loadIdentity(store).serverId

    applyServerName(store, "daily.example.test")

    expect(loadIdentity(store).serverId).toBe(serverId)
  })
})

describe("daily-server rename", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-rename-"))
    delete process.env.DAILY_SERVER_NAME
  })

  afterEach(() => {
    delete process.env.DAILY_SERVER_NAME
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function runRename(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(["node", "daily-server", "rename", ...args, "--data-dir", dataDir], {from: "node"})
  }

  it("sets the name and reports the one it replaced", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const store = openServerStore(dataDir, "ddf5d06d6d7b")
    store.close()

    await runRename("My server")

    const reopened = openServerStore(dataDir)
    expect(loadIdentity(reopened).name).toBe("My server")
    reopened.close()
    expect(logSpy).toHaveBeenCalledWith("Renamed server: ddf5d06d6d7b -> My server")

    logSpy.mockRestore()
  })

  it("accepts a name with spaces and trims the edges", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    openServerStore(dataDir, "ddf5d06d6d7b").close()

    await runRename("  Daily Server  ")

    const store = openServerStore(dataDir)
    expect(loadIdentity(store).name).toBe("Daily Server")
    store.close()

    vi.restoreAllMocks()
  })

  it("refuses a blank name rather than leaving the server unnamed", async () => {
    openServerStore(dataDir, "ddf5d06d6d7b").close()

    await expect(runRename("   ")).rejects.toThrow(/blank/)

    const store = openServerStore(dataDir)
    expect(loadIdentity(store).name).toBe("ddf5d06d6d7b")
    store.close()
  })

  it("refuses while DAILY_SERVER_NAME declares the name, naming the variable, and writes nothing", async () => {
    openServerStore(dataDir, "Declared").close()
    process.env.DAILY_SERVER_NAME = "Declared"

    await expect(runRename("My server")).rejects.toThrow(/DAILY_SERVER_NAME/)

    const store = openServerStore(dataDir)
    expect(loadIdentity(store).name).toBe("Declared")
    store.close()
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

describe("opening an Agent window elsewhere denies any request still waiting — TC-4", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>
  let child: ReturnType<typeof createDevice>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-window-replace-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
    child = createDevice(store, "Mac mini")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-4: a Child opening its own Agent window denies the Parent's waiting request and replaces the window, restarting the clock", async () => {
    openAgentWindow(store, parent.device.id)
    const request = createAgentRequest(store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    const childWindow = openAgentWindow(store, child.device.id)
    expect(childWindow.deviceId).toBe(child.device.id)
    expect(Date.parse(childWindow.expiresAt) - Date.now()).toBeGreaterThan(4 * 60 * 1000)

    const deniedRequest = store.db.prepare(`SELECT state, resolved_at, issued_agent_id FROM agent_requests WHERE id = ?`).get(request.id) as {
      state: string
      resolved_at: string | null
      issued_agent_id: string | null
    }
    expect(deniedRequest.state).toBe("denied")
    expect(deniedRequest.resolved_at).toBeTruthy()
    expect(deniedRequest.issued_agent_id).toBeNull()

    expect(findPendingAgentRequest(store, parent.device.id)).toBeNull()
    expect(findPendingAgentRequest(store, child.device.id)).toBeNull()

    const agentsMinted = store.db.prepare(`SELECT COUNT(*) as count FROM agents`).get() as {count: number}
    expect(agentsMinted.count).toBe(0)
  })
})

describe("creating an agent request needs an open window, and only one at a time — TC-5", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>
  let child: ReturnType<typeof createDevice>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-request-window-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
    child = createDevice(store, "Mac mini")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-5: a request is refused with no window open, accepted once inside one, refused a second time while the first still waits, and found only for the window's own Mac", async () => {
    const params = {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false}

    try {
      createAgentRequest(store, params)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_WINDOW_CLOSED)
    }

    openAgentWindow(store, parent.device.id)
    const request = createAgentRequest(store, params)
    expect(request.deviceId).toBe(parent.device.id)
    expect(request.code).toMatch(/^\d{6}$/)
    expect(request.state).toBe("pending")
    expect(Date.parse(request.expiresAt) - Date.now()).toBeGreaterThan(4 * 60 * 1000)
    expect(request.agentName).toBe(params.agentName)
    expect(request.returnsTo).toBe(params.returnsTo)
    expect(request.isLocalProgram).toBe(params.isLocalProgram)

    try {
      createAgentRequest(store, params)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_REQUEST_IN_PROGRESS)
    }

    expect(findPendingAgentRequest(store, parent.device.id)?.id).toBe(request.id)
    expect(findPendingAgentRequest(store, child.device.id)).toBeNull()
  })
})

describe("approving a request mints an agent and closes the window — TC-6", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-approve-mints-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-6: approving the one waiting request mints an agent owned by the approving Mac, marks the request approved and names the agent, and closes the window", async () => {
    openAgentWindow(store, parent.device.id)
    const request = createAgentRequest(store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    const agent = approveAgentRequest(store, request.id, request.code, parent.device.id)
    expect(agent.name).toBe("Claude Code")
    expect(agent.deviceId).toBe(parent.device.id)
    expect(agent.createdAt).toBeTruthy()
    expect(agent.lastUsedAt).toBeNull()
    expect(agent.revokedAt).toBeNull()

    const resolved = readAgentRequest(store, request.id)
    expect(resolved?.state).toBe("approved")
    expect(resolved?.resolvedAt).toBeTruthy()
    expect(resolved?.issuedAgentId).toBe(agent.id)

    const windowRow = store.db.prepare(`SELECT agent_window_device_id FROM server_identity WHERE id = 1`).get() as {
      agent_window_device_id: string | null
    }
    expect(windowRow.agent_window_device_id).toBeNull()

    expect(findPendingAgentRequest(store, parent.device.id)).toBeNull()
  })
})

describe("approving or denying a request checks ownership, then the code, then whether it can still be decided — TC-7", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>
  let child: ReturnType<typeof createDevice>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-approve-refusals-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
    child = createDevice(store, "Mac mini")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-7: a wrong code, another Mac's attempt (even with the right code), a second decision and an unknown id are each refused, and a denial leaves the window open with no agent minted", async () => {
    openAgentWindow(store, parent.device.id)
    const request = createAgentRequest(store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})
    const wrongCode = request.code === "000000" ? "111111" : "000000"

    try {
      approveAgentRequest(store, request.id, wrongCode, parent.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_CODE_MISMATCH)
    }

    try {
      approveAgentRequest(store, request.id, request.code, child.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.NOT_AGENT_OWNER)
    }

    denyAgentRequest(store, request.id, parent.device.id)

    try {
      approveAgentRequest(store, request.id, request.code, parent.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_REQUEST_NOT_PENDING)
    }

    try {
      approveAgentRequest(store, "not-a-real-request-id", request.code, parent.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_REQUEST_NOT_FOUND)
    }

    const deniedRow = store.db.prepare(`SELECT state FROM agent_requests WHERE id = ?`).get(request.id) as {state: string}
    expect(deniedRow.state).toBe("denied")

    const agentsMinted = store.db.prepare(`SELECT COUNT(*) as count FROM agents`).get() as {count: number}
    expect(agentsMinted.count).toBe(0)

    const windowRow = store.db.prepare(`SELECT agent_window_device_id FROM server_identity WHERE id = 1`).get() as {
      agent_window_device_id: string | null
    }
    expect(windowRow.agent_window_device_id).toBe(parent.device.id)
  })
})

describe("a lapsed agent request is invisible on read without blocking a fresh one — TC-9", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-request-lapse-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
  })

  afterEach(() => {
    vi.useRealTimers()
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-9: a request past its own deadline is invisible to the lookup and refuses approval as not pending, but its row is still 'pending' on disk since expiry is never written, and a fresh request can be created in its place", async () => {
    openAgentWindow(store, parent.device.id)
    const request = createAgentRequest(store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(Date.parse(request.expiresAt) + 1000)

    expect(findPendingAgentRequest(store, parent.device.id)).toBeNull()

    try {
      approveAgentRequest(store, request.id, request.code, parent.device.id)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(ProtocolErrorCode.AGENT_REQUEST_NOT_PENDING)
    }

    const staleRow = store.db.prepare(`SELECT state FROM agent_requests WHERE id = ?`).get(request.id) as {state: string}
    expect(staleRow.state).toBe("pending")

    openAgentWindow(store, parent.device.id)
    const fresh = createAgentRequest(store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})
    expect(fresh.id).not.toBe(request.id)
  })
})

describe("listing agents for one Mac or for every Mac — TC-10", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>
  let child: ReturnType<typeof createDevice>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-listing-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
    child = createDevice(store, "Mac mini")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function insertAgent(id: string, deviceId: string, name: string, createdAt: string, revokedAt: string | null): void {
    store.db
      .prepare(`INSERT INTO agents (id, device_id, name, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, NULL, ?)`)
      .run(id, deviceId, name, createdAt, revokedAt)
  }

  it("TC-10: listing every Mac's agents orders the active ones oldest-first and the revoked one last with exactly six fields each, and listing one Mac's answers only its own in the same order", async () => {
    insertAgent("agent-p", parent.device.id, "Claude Code on MacBook Air", "2026-01-01T00:00:00.000Z", null)
    insertAgent("agent-c-oldest", child.device.id, "Claude Code on Mac mini (1)", "2026-01-02T00:00:00.000Z", null)
    insertAgent("agent-c-revoked", child.device.id, "Claude Code on Mac mini (2)", "2026-01-03T00:00:00.000Z", "2026-01-04T00:00:00.000Z")

    const everyAgent = listAgents(store, null)
    expect(everyAgent.map((a) => a.id)).toEqual(["agent-p", "agent-c-oldest", "agent-c-revoked"])
    for (const agent of everyAgent) {
      expect(Object.keys(agent).sort()).toEqual(["createdAt", "deviceId", "id", "lastUsedAt", "name", "revokedAt"])
    }

    const childsAgents = listAgents(store, child.device.id)
    expect(childsAgents.map((a) => a.id)).toEqual(["agent-c-oldest", "agent-c-revoked"])
  })
})

describe("revoking a device revokes its agents and clears its Agent window — TC-13", () => {
  let dataDir: string
  let store: ServerStore
  let parent: ReturnType<typeof claimServer>
  let child: ReturnType<typeof createDevice>
  let another: ReturnType<typeof createDevice>
  let untouched: ReturnType<typeof createDevice>

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-revocation-cascade-"))
    store = openServerStore(dataDir)
    const code = ensureClaimCode(store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    parent = claimServer(store, code, "MacBook Air")
    child = createDevice(store, "Mac mini")
    another = createDevice(store, "iMac")
    untouched = createDevice(store, "iPad")
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function insertAgent(id: string, deviceId: string, name: string): void {
    store.db
      .prepare(`INSERT INTO agents (id, device_id, name, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, NULL, NULL)`)
      .run(id, deviceId, name, new Date().toISOString())
  }

  async function runDevice(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(["node", "daily-server", "device", ...args, "--data-dir", dataDir], {from: "node"})
  }

  it("TC-13: revoking a Mac cascades to its agents and clears its Agent window whichever route revoked it; the console reports how many agents went with it, says nothing already revoked twice, and prints no agent line for a Mac with none", async () => {
    insertAgent("agent-parent", parent.device.id, "Claude Code on MacBook Air")
    insertAgent("agent-child-1", child.device.id, "Claude Code on Mac mini (1)")
    insertAgent("agent-child-2", child.device.id, "Claude Code on Mac mini (2)")
    insertAgent("agent-another", another.device.id, "Claude Code on iMac")

    openAgentWindow(store, child.device.id)

    revokeDevice(store, child.device.id)

    const childAgents = store.db.prepare(`SELECT revoked_at FROM agents WHERE device_id = ?`).all(child.device.id) as {revoked_at: string | null}[]
    expect(childAgents).toHaveLength(2)
    expect(childAgents.every((a) => a.revoked_at)).toBe(true)

    const windowRow = store.db.prepare(`SELECT agent_window_device_id FROM server_identity WHERE id = 1`).get() as {
      agent_window_device_id: string | null
    }
    expect(windowRow.agent_window_device_id).toBeNull()

    const parentAgentAfterStoreRevoke = store.db.prepare(`SELECT revoked_at FROM agents WHERE id = ?`).get("agent-parent") as {
      revoked_at: string | null
    }
    expect(parentAgentAfterStoreRevoke.revoked_at).toBeNull()

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await runDevice("revoke", another.device.id)
    const firstRevokeOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(firstRevokeOutput).toContain(`Revoked device ${another.device.id}`)
    expect(firstRevokeOutput).toContain("Revoked 1 agent connected through it.")

    const anotherAgent = store.db.prepare(`SELECT revoked_at FROM agents WHERE id = ?`).get("agent-another") as {revoked_at: string | null}
    expect(anotherAgent.revoked_at).toBeTruthy()

    logSpy.mockClear()
    await runDevice("revoke", another.device.id)
    const secondRevokeOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(secondRevokeOutput.toLowerCase()).toContain("already revoked")
    expect(secondRevokeOutput).not.toContain("agent connected")
    expect(secondRevokeOutput).not.toContain("agents connected")

    logSpy.mockClear()
    await runDevice("revoke", untouched.device.id)
    const noAgentOutput = logSpy.mock.calls.map((call) => call[0]).join("\n")
    expect(noAgentOutput).toContain(`Revoked device ${untouched.device.id}`)
    expect(noAgentOutput).not.toContain("agent connected")
    expect(noAgentOutput).not.toContain("agents connected")

    logSpy.mockRestore()

    const parentAgentFinal = store.db.prepare(`SELECT revoked_at FROM agents WHERE id = ?`).get("agent-parent") as {revoked_at: string | null}
    expect(parentAgentFinal.revoked_at).toBeNull()
  })
})

describe("migrating an existing store to v005 for agents — TC-24", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agents-migration-"))
  })

  afterEach(() => {
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-24: a store already at v004 gains agents, agent_requests and the new columns on the first open after the upgrade, leaves every pre-existing row untouched, and applies nothing new on a second open", async () => {
    const before = openServerStore(dataDir)
    const code = ensureClaimCode(before)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const parent = claimServer(before, code, "MacBook Air")
    createDevice(before, "Mac mini")
    openEnrollmentWindow(before)
    createEnrollmentRequest(before, "iMac")

    const doc: StoredSnapshotDocument = {version: 4, meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-a"}, docs: {tasks: {}}}
    writeSnapshotIfUnchanged(before, doc, null, parent.device.id)
    await writeAsset(before, "abc123.png", Readable.from(Buffer.from("attachment-bytes")), parent.device.id, 10 * 1024 * 1024)

    const devicesBefore = before.db.prepare(`SELECT * FROM devices ORDER BY id`).all()
    const enrollmentRequestsBefore = before.db.prepare(`SELECT * FROM enrollment_requests ORDER BY id`).all()
    const snapshotBefore = before.db.prepare(`SELECT * FROM snapshot`).all()
    const assetsBefore = before.db.prepare(`SELECT * FROM assets ORDER BY name`).all()

    before.close()

    const migrated = openServerStore(dataDir)

    const appliedVersions = migrated.db.prepare(`SELECT version FROM _migrations ORDER BY version`).all() as {version: number}[]
    expect(appliedVersions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6])

    const agentColumns = (migrated.db.prepare(`PRAGMA table_info(agents)`).all() as {name: string}[]).map((c) => c.name).sort()
    expect(agentColumns).toEqual(["created_at", "device_id", "id", "last_used_at", "name", "revoked_at"].sort())

    const agentRequestColumns = (migrated.db.prepare(`PRAGMA table_info(agent_requests)`).all() as {name: string}[]).map((c) => c.name).sort()
    expect(agentRequestColumns).toEqual(
      [
        "id",
        "device_id",
        "code",
        "agent_name",
        "returns_to",
        "is_local_program",
        "state",
        "created_at",
        "expires_at",
        "resolved_at",
        "issued_agent_id",
      ].sort(),
    )

    const agentIndexes = (migrated.db.prepare(`PRAGMA index_list(agents)`).all() as {name: string}[]).map((idx) => idx.name)
    expect(agentIndexes.some((name) => name.toLowerCase().includes("device"))).toBe(true)

    const identityColumns = (migrated.db.prepare(`PRAGMA table_info(server_identity)`).all() as {name: string}[]).map((c) => c.name)
    expect(identityColumns).toContain("agent_window_expires_at")
    expect(identityColumns).toContain("agent_window_device_id")
    const identityRow = migrated.db.prepare(`SELECT agent_window_expires_at, agent_window_device_id FROM server_identity WHERE id = 1`).get() as {
      agent_window_expires_at: string | null
      agent_window_device_id: string | null
    }
    expect(identityRow.agent_window_expires_at).toBeNull()
    expect(identityRow.agent_window_device_id).toBeNull()

    const deviceColumns = (migrated.db.prepare(`PRAGMA table_info(devices)`).all() as {name: string}[]).map((c) => c.name)
    expect(deviceColumns).toContain("time_zone")
    const timeZones = migrated.db.prepare(`SELECT time_zone FROM devices`).all() as {time_zone: string | null}[]
    expect(timeZones).toHaveLength(2)
    expect(timeZones.every((row) => row.time_zone === null)).toBe(true)

    expect(migrated.db.prepare(`SELECT * FROM devices ORDER BY id`).all()).toEqual(devicesBefore)
    expect(migrated.db.prepare(`SELECT * FROM enrollment_requests ORDER BY id`).all()).toEqual(enrollmentRequestsBefore)
    expect(migrated.db.prepare(`SELECT * FROM snapshot`).all()).toEqual(snapshotBefore)
    expect(migrated.db.prepare(`SELECT * FROM assets ORDER BY name`).all()).toEqual(assetsBefore)

    migrated.close()

    const reopened = openServerStore(dataDir)
    const appliedVersionsAfterSecondOpen = reopened.db.prepare(`SELECT version FROM _migrations ORDER BY version`).all() as {version: number}[]
    expect(appliedVersionsAfterSecondOpen.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6])
    reopened.close()
  })
})
