import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it} from "vitest"

import {RemoteWriteConflictError, SnapshotVersionAheadError} from "@daily/protocol"

import {DailyServerRemoteAdapter} from "@core/storage/sync/adapters/DailyServerRemoteAdapter"
import {DailySyncClient} from "@core/storage/sync/server/DailySyncClient"
import {KNOWN_SNAPSHOT_VERSION} from "@core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"
import {bootSyncServer, claimFirstDevice, enrollSecondDevice} from "../../../helpers/syncServer"

import type {IssuedCredential, ServerSyncBinding, SnapshotDocs, SnapshotFile} from "@daily/protocol"
import type {BootedSyncServer} from "../../../helpers/syncServer"

function emptyDocs(): SnapshotDocs {
  return {tasks: [], tags: [], branches: [], files: [], events: [], settings: null}
}

function makeTask(id: string, updatedAt: string) {
  return {
    id,
    status: "active",
    content: `task ${id}`,
    minimized: false,
    order_index: 0,
    scheduled_date: "2026-08-17",
    scheduled_time: "10:00:00",
    scheduled_timezone: "UTC",
    estimated_time: 0,
    spent_time: 0,
    branch_id: "main",
    tags: [],
    attachments: [],
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
  }
}

function makeFile(id: string, name: string): SnapshotFile {
  const now = "2026-08-17T10:00:00.000Z"
  return {id, name, mime_type: "text/plain", size: 1, created_at: now, updated_at: now, deleted_at: null}
}

function bindingFromCredential(server: BootedSyncServer, credential: IssuedCredential): ServerSyncBinding {
  return {
    baseUrl: server.baseUrl,
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: credential.device.id,
    deviceName: credential.device.name,
    token: credential.token,
    fingerprint: null,
    insecure: true,
    boundAt: new Date().toISOString(),
  }
}

describe("DailyServerRemoteAdapter — conditional reads and writes", () => {
  it("reads_TC-8_two_nulls_from_an_empty_server_and_rejects_a_stale_conditional_write", async () => {
    const server = await bootSyncServer()

    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const adapter = new DailyServerRemoteAdapter(bindingFromCredential(server, credential))

      const empty = await adapter.loadSnapshotWithRevision()
      expect(empty).toEqual({snapshot: null, revision: null})

      const docA = buildSnapshot({...emptyDocs(), tasks: [makeTask("tA", "2026-08-10T00:00:00.000Z") as never]})
      const firstRevision = await adapter.saveSnapshotIfUnchanged(docA, null)
      expect(firstRevision).toBe("1")

      const readBack = await adapter.loadSnapshotWithRevision()
      expect(readBack.revision).toBe("1")
      expect(readBack.snapshot?.docs.tasks.map((task) => task.id)).toEqual(["tA"])

      const docB = buildSnapshot({
        ...emptyDocs(),
        tasks: [makeTask("tA", "2026-08-10T00:00:00.000Z") as never, makeTask("tB", "2026-08-11T00:00:00.000Z") as never],
      })
      const secondRevision = await adapter.saveSnapshotIfUnchanged(docB, firstRevision)
      expect(secondRevision).toBe("2")

      const docC = buildSnapshot({...emptyDocs(), tasks: [makeTask("tC", "2026-08-12T00:00:00.000Z") as never]})
      await expect(adapter.saveSnapshotIfUnchanged(docC, firstRevision)).rejects.toBeInstanceOf(RemoteWriteConflictError)

      const finalRead = await adapter.loadSnapshotWithRevision()
      expect(finalRead.revision).toBe("2")
      expect(finalRead.snapshot?.docs.tasks.map((task) => task.id).toSorted()).toEqual(["tA", "tB"])
    } finally {
      await server.close()
    }
  })
})

describe("DailyServerRemoteAdapter — the snapshot version guard", () => {
  it("throws_TC-9_SnapshotVersionAheadError_on_a_read_ahead_of_this_build_and_on_a_write_behind_the_stored_version", async () => {
    const aheadServer = await bootSyncServer()
    const behindServer = await bootSyncServer()

    try {
      const aheadCredential = await claimFirstDevice(aheadServer, "MacBook Air")
      const aheadSeedingClient = new DailySyncClient({baseUrl: aheadServer.baseUrl, token: aheadCredential.token, fingerprint: null})
      await aheadSeedingClient.writeSnapshot(
        {version: KNOWN_SNAPSHOT_VERSION + 1, docs: {tasks: []}, meta: {updatedAt: "2026-08-10T00:00:00.000Z", hash: "from-a-newer-build"}},
        null,
      )

      const aheadAdapter = new DailyServerRemoteAdapter(bindingFromCredential(aheadServer, aheadCredential))
      await expect(aheadAdapter.loadSnapshotWithRevision()).rejects.toBeInstanceOf(SnapshotVersionAheadError)
      await expect(aheadAdapter.loadSnapshot()).rejects.toBeInstanceOf(SnapshotVersionAheadError)

      const behindCredential = await claimFirstDevice(behindServer, "MacBook Air")
      const behindAdapter = new DailyServerRemoteAdapter(bindingFromCredential(behindServer, behindCredential))

      const currentDoc = buildSnapshot({...emptyDocs(), tasks: [makeTask("tCurrent", "2026-08-10T00:00:00.000Z") as never]})
      const currentRevision = await behindAdapter.saveSnapshotIfUnchanged(currentDoc, null)

      const lowerVersionDoc = {
        ...buildSnapshot({...emptyDocs(), tasks: [makeTask("tOld", "2026-08-09T00:00:00.000Z") as never]}),
        version: 3 as const,
      }
      await expect(behindAdapter.saveSnapshotIfUnchanged(lowerVersionDoc, currentRevision)).rejects.toBeInstanceOf(SnapshotVersionAheadError)

      const behindClient = new DailySyncClient({baseUrl: behindServer.baseUrl, token: behindCredential.token, fingerprint: null})
      const stillCurrent = await behindClient.readSnapshot()
      expect((stillCurrent.snapshot as {meta: {hash: string}} | null)?.meta.hash).toBe(currentDoc.meta.hash)
      expect(stillCurrent.revision).toBe(currentRevision)
    } finally {
      await aheadServer.close()
      await behindServer.close()
    }
  })
})

describe("DailyServerRemoteAdapter — assets", () => {
  it("syncs_TC-10_assets_under_the_shared_naming_scheme_and_skips_a_file_present_on_neither_side", async () => {
    const server = await bootSyncServer()
    const firstAssetsDir = mkdtempSync(join(tmpdir(), "daily-server-assets-first-"))
    const secondAssetsDir = mkdtempSync(join(tmpdir(), "daily-server-assets-second-"))

    try {
      const firstCredential = await claimFirstDevice(server, "MacBook Air")
      const secondCredential = await enrollSecondDevice(server, "Mac mini")

      const firstAdapter = new DailyServerRemoteAdapter(bindingFromCredential(server, firstCredential))
      const secondAdapter = new DailyServerRemoteAdapter(bindingFromCredential(server, secondCredential))

      const bytes = Buffer.from("attachment-bytes")
      writeFileSync(join(firstAssetsDir, "f1.png"), bytes)

      const manifest: SnapshotFile[] = [makeFile("f1", "photo.png"), makeFile("missing", "nowhere.png")]

      await firstAdapter.syncAssets(firstAssetsDir, manifest)

      const uploaded = await new DailySyncClient({baseUrl: server.baseUrl, token: firstCredential.token, fingerprint: null}).listAssets()
      expect(uploaded.map((asset) => asset.name)).toEqual(["f1.png"])

      await expect(secondAdapter.syncAssets(secondAssetsDir, manifest)).resolves.not.toThrow()

      const downloaded = readFileSync(join(secondAssetsDir, "f1.png"))
      expect(downloaded.equals(bytes)).toBe(true)
      expect(existsSync(join(secondAssetsDir, "missing.png"))).toBe(false)
    } finally {
      await server.close()
      rmSync(firstAssetsDir, {recursive: true, force: true})
      rmSync(secondAssetsDir, {recursive: true, force: true})
    }
  })
})
