import {execFileSync, execSync} from "node:child_process"
import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {Readable} from "node:stream"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"

import {findAsset, listAssets, writeAsset} from "@server/assets/AssetStore"
import {authenticateRequest} from "@server/devices/authenticateRequest"
import {createDevice, listDevices, revokeDevice} from "@server/devices/DeviceStore"
import {approveEnrollment, createEnrollmentRequest} from "@server/enrollment/EnrollmentStore"
import {claimServer} from "@server/http/routes/claim"
import {ensureClaimCode} from "@server/identity/ServerIdentityStore"
import {buildProgram} from "@server/index"
import {readRevision, readSnapshot, writeSnapshotIfUnchanged} from "@server/snapshot/SnapshotStore"
import {openServerStore} from "@server/store/instance"
import pkg from "../../package.json"

import type {StoredSnapshotDocument} from "@server/snapshot/SnapshotStore"
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
    expect(appliedAfterFirstOpen).toHaveLength(3)

    first.close()

    const second = openServerStore(dataDir)

    const identityRowsAfterSecondOpen = second.db.prepare("SELECT server_id FROM server_identity").all() as {server_id: string}[]
    expect(identityRowsAfterSecondOpen).toHaveLength(1)
    expect(identityRowsAfterSecondOpen[0].server_id).toBe(serverId)

    const appliedAfterSecondOpen = second.db.prepare("SELECT version FROM _migrations").all()
    expect(appliedAfterSecondOpen).toHaveLength(3)

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
