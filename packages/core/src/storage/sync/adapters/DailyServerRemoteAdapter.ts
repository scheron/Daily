import {extname, join, resolve, sep} from "node:path"
import fs from "fs-extra"

import {ProtocolError, ProtocolErrorCode, RemoteWriteConflictError, SnapshotVersionAheadError} from "@daily/protocol"
import {isArray, isBoolean, isNumber, isObject, isString} from "@daily/std"

import {logger} from "../../../utils/logger"
import {assertKnownSnapshotVersion} from "../../../utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "../../../utils/sync/snapshot/isValidSnapshot"
import {DailySyncClient, SyncTransferError} from "../server/DailySyncClient"

import type {IRevisionedRemoteStorage, RemoteReadResult, ServerSyncBinding, Snapshot, SnapshotFile, SnapshotRevision} from "@daily/protocol"
import type {RequestLogBuffer} from "../../../utils/requestLog/RequestLogBuffer"

/**
 * IRevisionedRemoteStorage over a Daily Sync Server this device has bound itself to. The server
 * has no unconditional write, so every push is a compare-and-swap against the revision the
 * snapshot was read at, and a lost race surfaces as `RemoteWriteConflictError` for `SyncEngine`
 * to retry.
 */
export class DailyServerRemoteAdapter implements IRevisionedRemoteStorage {
  readonly supportsRevisions = true as const

  private readonly client: DailySyncClient

  constructor(binding: ServerSyncBinding, requestLog?: RequestLogBuffer) {
    this.client = new DailySyncClient({baseUrl: binding.baseUrl, token: binding.token, fingerprint: binding.fingerprint, requestLog})
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    const {snapshot} = await this.loadSnapshotWithRevision()
    return snapshot
  }

  async loadSnapshotWithRevision(signal?: AbortSignal): Promise<RemoteReadResult> {
    const {snapshot: parsed, revision} = await this.client.readSnapshot(signal)
    if (parsed === null) return {snapshot: null, revision}

    assertKnownSnapshotVersion(parsed)

    const snapshot = parsed as Snapshot
    if (
      !isValidSnapshot(snapshot) ||
      !Number.isInteger(snapshot.version) ||
      !snapshot.meta.hash ||
      !isTimestamp(snapshot.meta.updatedAt) ||
      !hasValidCollections(snapshot.docs)
    ) {
      throw new SyncTransferError("terminal", "The server's stored snapshot is invalid")
    }
    snapshot.docs.events = snapshot.docs.events ?? []
    return {snapshot, revision}
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const {revision} = await this.loadSnapshotWithRevision()
    await this.saveSnapshotIfUnchanged(snapshot, revision)
  }

  async saveSnapshotIfUnchanged(snapshot: Snapshot, expectedRevision: SnapshotRevision | null, signal?: AbortSignal): Promise<SnapshotRevision> {
    try {
      const {revision} = await this.client.writeSnapshot(snapshot, expectedRevision, signal)
      return revision
    } catch (err) {
      if (err instanceof ProtocolError && err.code === ProtocolErrorCode.REVISION_CONFLICT) {
        throw new RemoteWriteConflictError(`Server rejected the write at revision ${expectedRevision ?? "none"}`)
      }

      if (err instanceof ProtocolError && err.code === ProtocolErrorCode.SNAPSHOT_VERSION_BEHIND) {
        throw new SnapshotVersionAheadError(snapshot.version + 1)
      }

      throw err
    }
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[], signal?: AbortSignal): Promise<void> {
    if (!fileManifest.length) return

    signal?.throwIfAborted()
    await fs.ensureDir(localAssetsDir)

    const localRoot = resolve(localAssetsDir) + sep
    const remoteNames = new Set((await this.client.listAssets(signal)).map((asset) => asset.name))

    for (const file of fileManifest) {
      signal?.throwIfAborted()
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localPath = join(localAssetsDir, filename)

      if (!resolve(localPath).startsWith(localRoot)) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Skipping asset with suspicious path: ${filename}`)
        continue
      }

      try {
        const localExists = await fs.pathExists(localPath)
        const remoteExists = remoteNames.has(filename)

        if (localExists && !remoteExists) {
          await this.client.uploadAsset(filename, await fs.readFile(localPath), signal)
        } else if (remoteExists && !localExists) {
          const bytes = await this.client.downloadAsset(filename, signal)
          signal?.throwIfAborted()
          await fs.writeFile(localPath, bytes)
        }
      } catch (err) {
        signal?.throwIfAborted()
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to sync asset ${filename}`, err)
      }
    }
  }
}

type SnapshotRow = Record<string, unknown>

function hasValidCollections(docs: Snapshot["docs"]): boolean {
  return (
    hasMergeableRows(docs.tasks, isValidTask) &&
    hasMergeableRows(docs.tags, (row) => strings(row.name, row.color) && nullableStrings(row.branch_id ?? null)) &&
    hasMergeableRows(docs.branches, (row) => isString(row.name) && nullableStrings(row.description ?? null, row.emoji ?? null)) &&
    hasMergeableRows(
      docs.milestones ?? [],
      (row) => strings(row.branch_id, row.name, row.description) && nullableStrings(row.target_date) && Number.isFinite(row.order_index),
    ) &&
    hasMergeableRows(docs.relations ?? [], (row) => strings(row.blocker_id, row.blocked_id)) &&
    hasMergeableRows(
      docs.comments ?? [],
      (row) => strings(row.task_id, row.branch_id, row.content) && nullableStrings(row.kind ?? null, row.provider ?? null),
    ) &&
    hasMergeableRows(docs.subtasks ?? [], (row) => strings(row.task_id, row.content, row.order_key) && isBoolean(row.done)) &&
    hasMergeableRows(docs.files, isValidFile) &&
    hasMergeableRows(docs.events ?? [], isValidEvent, true)
  )
}

function hasMergeableRows(rows: unknown, validate: (row: SnapshotRow) => boolean, appendOnly = false): boolean {
  if (!isArray(rows)) return false
  const ids = new Set<string>()
  for (const row of rows) {
    if (
      !isObject<SnapshotRow>(row) ||
      !isString(row.id) ||
      !row.id ||
      ids.has(row.id) ||
      !isTimestamp(row.created_at) ||
      (!appendOnly && (!isTimestamp(row.updated_at) || (row.deleted_at !== null && !isTimestamp(row.deleted_at)))) ||
      !validate(row)
    )
      return false
    ids.add(row.id)
  }
  return true
}

function isValidTask(row: SnapshotRow): boolean {
  return (
    strings(row.status, row.content, row.branch_id) &&
    isBoolean(row.minimized) &&
    [row.order_index, row.estimated_time, row.spent_time].every(Number.isFinite) &&
    nullableStrings(row.scheduled_date, row.scheduled_time, row.scheduled_timezone, row.milestone_id ?? null, row.priority ?? null) &&
    isArray(row.tags) &&
    row.tags.every(isString) &&
    (row.attachments == null || (isArray(row.attachments) && row.attachments.every(isString)))
  )
}

function isValidFile(row: SnapshotRow): boolean {
  return (
    isString(row.id) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(row.id) &&
    isString(row.name) &&
    !row.name.includes("\0") &&
    isString(row.mime_type) &&
    isNumber(row.size) &&
    Number.isSafeInteger(row.size) &&
    row.size >= 0
  )
}

function isValidEvent(row: SnapshotRow): boolean {
  return (
    strings(row.task_id, row.branch_id, row.type, row.event_date) &&
    nullableStrings(
      row.from_date ?? null,
      row.to_date ?? null,
      row.kind ?? null,
      row.provider ?? null,
      row.from_status ?? null,
      row.to_status ?? null,
      row.from_priority ?? null,
      row.to_priority ?? null,
      row.from_branch_id ?? null,
      row.to_branch_id ?? null,
      row.move_id ?? null,
    ) &&
    (row.sequence == null || Number.isSafeInteger(row.sequence))
  )
}

function isTimestamp(value: unknown): boolean {
  return isString(value) && Number.isFinite(Date.parse(value))
}

function strings(...values: unknown[]): boolean {
  return values.every(isString)
}

function nullableStrings(...values: unknown[]): boolean {
  return values.every((value) => value === null || isString(value))
}
