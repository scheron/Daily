import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Readable} from "node:stream"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {writeAsset} from "../src/assets/AssetStore"
import {createBackup, isBackupName, sweepPartialBackups} from "../src/backup/createBackup"
import {listBackups, pruneBackups} from "../src/backup/pruneBackups"
import {resolveServerConfig} from "../src/config/resolveServerConfig"
import {createDevice} from "../src/devices/DeviceStore"
import {ServerSetupError} from "../src/errors/server/ServerSetupError"
import {openServerStore} from "../src/store/instance"

import type {ServerStore} from "../src/store/instance"

const BACKUP_ENV_KEYS = ["DAILY_SERVER_BACKUP_INTERVAL_HOURS", "DAILY_SERVER_BACKUP_KEEP", "DAILY_SERVER_BACKUP_DIR"] as const

describe("createBackup", () => {
  let dataDir: string
  let backupDir: string
  let store: ServerStore

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-backup-data-"))
    backupDir = mkdtempSync(join(tmpdir(), "daily-backup-out-"))
    store = openServerStore(dataDir)
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
    rmSync(backupDir, {recursive: true, force: true})
  })

  async function putAsset(name: string, body: string): Promise<void> {
    const {device} = createDevice(store, `device-for-${name}`)
    await writeAsset(store, name, Readable.from([Buffer.from(body)]), device.id, 1024)
  }

  it("writes a database snapshot that opens on its own", async () => {
    const backupPath = await createBackup(store, backupDir)

    const restored = openServerStore(backupPath)
    expect(restored.db.prepare(`SELECT COUNT(*) AS n FROM server_identity`).get<{n: number}>()?.n).toBe(1)
    restored.close()
  })

  it("names the backup so it can be told apart from staging", async () => {
    const backupPath = await createBackup(store, backupDir)

    expect(isBackupName(backupPath.split("/").pop() as string)).toBe(true)
    expect(await listBackups(backupDir)).toHaveLength(1)
  })

  it("hard-links assets instead of copying their bytes", async () => {
    await putAsset("kept.txt", "one")

    const backupPath = await createBackup(store, backupDir)

    const original = statSync(join(dataDir, "assets", "kept.txt"))
    const linked = statSync(join(backupPath, "assets", "kept.txt"))

    expect(linked.ino).toBe(original.ino)
    expect(linked.nlink).toBeGreaterThan(1)
  })

  it("keeps the bytes an asset had when the backup ran, even after it is overwritten", async () => {
    await putAsset("shifting.txt", "before")

    const backupPath = await createBackup(store, backupDir)
    await putAsset("shifting.txt", "after")

    expect(readFileSync(join(dataDir, "assets", "shifting.txt"), "utf8")).toBe("after")
    expect(readFileSync(join(backupPath, "assets", "shifting.txt"), "utf8")).toBe("before")
  })

  it("leaves no backup behind when the snapshot fails", async () => {
    const broken: ServerStore = {...store, db: {...store.db, backup: () => Promise.reject(new Error("disk is full"))}}

    await expect(createBackup(broken, backupDir)).rejects.toThrow("disk is full")
    expect(await listBackups(backupDir)).toHaveLength(0)
  })

  it("sweeps staging a crash left behind", async () => {
    const orphan = join(backupDir, ".tmp-abandoned")
    mkdirSync(orphan, {recursive: true})
    writeFileSync(join(orphan, "server.sqlite"), "half a database")

    await sweepPartialBackups(backupDir)

    expect(existsSync(orphan)).toBe(false)
  })
})

describe("pruneBackups", () => {
  let dataDir: string
  let backupDir: string
  let store: ServerStore

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-prune-data-"))
    backupDir = mkdtempSync(join(tmpdir(), "daily-prune-out-"))
    store = openServerStore(dataDir)
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
    rmSync(backupDir, {recursive: true, force: true})
  })

  it("keeps the newest and removes the rest, oldest first", async () => {
    const first = await createBackup(store, backupDir)
    const second = await createBackup(store, backupDir)
    const third = await createBackup(store, backupDir)

    const removed = await pruneBackups(backupDir, 2)

    expect(removed).toHaveLength(1)
    expect(removed[0]).toBe(first.split("/").pop())
    expect(await listBackups(backupDir)).toEqual([second, third].map((p) => p.split("/").pop()))
  })

  it("removes nothing when there is room to spare", async () => {
    await createBackup(store, backupDir)

    expect(await pruneBackups(backupDir, 14)).toEqual([])
    expect(await listBackups(backupDir)).toHaveLength(1)
  })

  it("ignores anything it did not write", async () => {
    await createBackup(store, backupDir)
    const parked = mkdtempSync(join(backupDir, "operator-notes-"))

    await pruneBackups(backupDir, 0)

    expect(await listBackups(backupDir)).toHaveLength(0)
    expect(existsSync(parked)).toBe(true)
  })
})

describe("backup configuration", () => {
  const saved = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const key of BACKUP_ENV_KEYS) {
      saved.set(key, process.env[key])
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of BACKUP_ENV_KEYS) {
      const value = saved.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("schedules a daily backup beside the data by default", () => {
    const config = resolveServerConfig({dataDir: "/data"})

    expect(config.backup).toEqual({intervalMs: 24 * 60 * 60 * 1000, keep: 14, dir: join("/data", "backups")})
  })

  it("treats a zero interval as off", () => {
    process.env.DAILY_SERVER_BACKUP_INTERVAL_HOURS = "0"

    expect(resolveServerConfig({dataDir: "/data"}).backup).toBeNull()
  })

  it("refuses a retention that would delete every backup at once", () => {
    process.env.DAILY_SERVER_BACKUP_KEEP = "0"

    expect(() => resolveServerConfig({dataDir: "/data"})).toThrow(ServerSetupError)
  })

  it("refuses a negative interval", () => {
    process.env.DAILY_SERVER_BACKUP_INTERVAL_HOURS = "-1"

    expect(() => resolveServerConfig({dataDir: "/data"})).toThrow(ServerSetupError)
  })

  it("takes the directory from the environment", () => {
    process.env.DAILY_SERVER_BACKUP_DIR = "/elsewhere/backups"

    expect(resolveServerConfig({dataDir: "/data"}).backup?.dir).toBe("/elsewhere/backups")
  })
})
