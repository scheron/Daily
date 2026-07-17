import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SnapshotVersionAheadError} from "@shared/errors/sync/SnapshotVersionAheadError"

import {FolderRemoteAdapter} from "@main/storage/sync/adapters/FolderRemoteAdapter"
import {buildSnapshot} from "@main/utils/sync/snapshot/buildSnapshot"

import type {SnapshotDocs, SnapshotFile} from "@main/types/sync"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), lifecycle: vi.fn(), CONTEXT: {SYNC_REMOTE: "SYNC_REMOTE"}},
}))

function emptyDocs(): SnapshotDocs {
  return {tasks: [], tags: [], branches: [], files: [], events: [], settings: null}
}

function makeFile(id: string, name: string): SnapshotFile {
  const now = "2026-07-18T10:00:00.000Z"
  return {id, name, mime_type: "text/plain", size: 1, created_at: now, updated_at: now, deleted_at: null}
}

describe("FolderRemoteAdapter", () => {
  let dir: string
  let assetsDir: string
  let adapter: FolderRemoteAdapter

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "daily-folder-remote-"))
    assetsDir = mkdtempSync(join(tmpdir(), "daily-local-assets-"))
    adapter = new FolderRemoteAdapter(dir)
  })

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true})
    rmSync(assetsDir, {recursive: true, force: true})
  })

  it("returns null when the snapshot file does not exist", async () => {
    await expect(adapter.loadSnapshot()).resolves.toBeNull()
  })

  it("round-trips a snapshot and leaves no tmp file behind", async () => {
    const snapshot = buildSnapshot(emptyDocs())
    await adapter.saveSnapshot(snapshot)

    const loaded = await adapter.loadSnapshot()
    expect(loaded?.meta.hash).toBe(snapshot.meta.hash)
    expect(await fs.pathExists(join(dir, ".snapshot.tmp"))).toBe(false)
    expect(await fs.pathExists(join(dir, "snapshot.json"))).toBe(true)
  })

  it("treats corrupt JSON as an empty remote", async () => {
    await fs.writeFile(join(dir, "snapshot.json"), "{not json", "utf-8")
    await expect(adapter.loadSnapshot()).resolves.toBeNull()
  })

  it("treats a structurally invalid snapshot as an empty remote", async () => {
    await fs.writeFile(join(dir, "snapshot.json"), JSON.stringify({version: 3, docs: {}, meta: {}}), "utf-8")
    await expect(adapter.loadSnapshot()).resolves.toBeNull()
  })

  it("throws SnapshotVersionAheadError on a snapshot from a newer schema", async () => {
    await fs.writeFile(join(dir, "snapshot.json"), JSON.stringify({version: 4, docs: {}, meta: {updatedAt: "x", hash: "y"}}), "utf-8")
    await expect(adapter.loadSnapshot()).rejects.toThrow(SnapshotVersionAheadError)
  })

  it("copies assets missing on either side and never overwrites existing ones", async () => {
    await fs.writeFile(join(assetsDir, "local-only.txt"), "local", "utf-8")
    await fs.ensureDir(join(dir, "assets"))
    await fs.writeFile(join(dir, "assets", "remote-only.txt"), "remote", "utf-8")
    await fs.writeFile(join(assetsDir, "both.txt"), "local-version", "utf-8")
    await fs.writeFile(join(dir, "assets", "both.txt"), "remote-version", "utf-8")

    await adapter.syncAssets(assetsDir, [makeFile("local-only", "a.txt"), makeFile("remote-only", "b.txt"), makeFile("both", "c.txt")])

    expect(await fs.readFile(join(dir, "assets", "local-only.txt"), "utf-8")).toBe("local")
    expect(await fs.readFile(join(assetsDir, "remote-only.txt"), "utf-8")).toBe("remote")
    expect(await fs.readFile(join(assetsDir, "both.txt"), "utf-8")).toBe("local-version")
    expect(await fs.readFile(join(dir, "assets", "both.txt"), "utf-8")).toBe("remote-version")
  })
})
