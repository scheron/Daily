import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"

import type {ServerStore} from "@server/store/instance"

/** The parts of a Daily snapshot the server reads. `docs` is stored and returned untouched. */
export type StoredSnapshotDocument = {
  version: number
  meta: {updatedAt: string; hash: string}
  docs: Record<string, unknown>
}

export type StoredSnapshot = {
  revision: string
  version: number
  hash: string
  updatedAt: string
  writtenByDeviceId: string | null
  writtenAt: string
  document: StoredSnapshotDocument
}

export type SnapshotStats = {revision: string; version: number; hash: string; updatedAt: string; bytes: number}

type SnapshotRow = {
  revision: number
  version: number
  hash: string
  updated_at: string
  written_by_device_id: string | null
  written_at: string
  document: string
}

/**
 * The server's own, deliberately weak structural check: `version` is a positive integer with no
 * upper bound, `meta.updatedAt` and `meta.hash` are non-empty strings, and `docs` is a non-null
 * object. It does not look inside `docs` and knows nothing about tasks.
 */
export function isStorableSnapshot(value: unknown): value is StoredSnapshotDocument {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>
  if (typeof candidate.version !== "number" || !Number.isInteger(candidate.version) || candidate.version < 1) return false

  const meta = candidate.meta
  if (typeof meta !== "object" || meta === null) return false

  const metaCandidate = meta as Record<string, unknown>
  if (typeof metaCandidate.updatedAt !== "string" || metaCandidate.updatedAt.length === 0) return false
  if (typeof metaCandidate.hash !== "string" || metaCandidate.hash.length === 0) return false

  if (typeof candidate.docs !== "object" || candidate.docs === null) return false

  return true
}

/** Reads the stored snapshot together with the revision it was read at, or `null` when the server holds none yet. */
export function readSnapshot(store: ServerStore): StoredSnapshot | null {
  const row = store.db
    .prepare(`SELECT revision, version, hash, updated_at, written_by_device_id, written_at, document FROM snapshot WHERE id = 1`)
    .get() as SnapshotRow | undefined

  return row ? toStoredSnapshot(row) : null
}

/** Reads only the current revision, as a decimal string, or `null` when the server holds no snapshot. */
export function readRevision(store: ServerStore): string | null {
  const row = store.db.prepare(`SELECT revision FROM snapshot WHERE id = 1`).get() as {revision: number} | undefined

  return row ? String(row.revision) : null
}

/** Reads the revision, version, hash, update time and stored byte size, for `daily-server status`. */
export function snapshotStats(store: ServerStore): SnapshotStats | null {
  const row = store.db.prepare(`SELECT revision, version, hash, updated_at, document FROM snapshot WHERE id = 1`).get() as
    | {revision: number; version: number; hash: string; updated_at: string; document: string}
    | undefined

  if (!row) return null

  return {
    revision: String(row.revision),
    version: row.version,
    hash: row.hash,
    updatedAt: row.updated_at,
    bytes: Buffer.byteLength(row.document, "utf8"),
  }
}

/**
 * Throws `ProtocolError(REVISION_CONFLICT)` when `expectedRevision` is not what the store holds,
 * and `ProtocolError(SNAPSHOT_VERSION_BEHIND)` when `document.version` is lower than the stored
 * version. Returns the new revision on success.
 */
export function writeSnapshotIfUnchanged(
  store: ServerStore,
  document: StoredSnapshotDocument,
  expectedRevision: string | null,
  writtenByDeviceId: string,
): string {
  const write = store.db.transaction((): string => {
    const current = store.db.prepare(`SELECT revision, version FROM snapshot WHERE id = 1`).get() as {revision: number; version: number} | undefined

    if (!current) {
      if (expectedRevision !== null) throw new ProtocolError(ProtocolErrorCode.REVISION_CONFLICT)

      store.db
        .prepare(
          `INSERT INTO snapshot (id, revision, version, hash, updated_at, written_by_device_id, written_at, document)
           VALUES (1, 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(document.version, document.meta.hash, document.meta.updatedAt, writtenByDeviceId, new Date().toISOString(), JSON.stringify(document))

      return "1"
    }

    if (String(current.revision) !== expectedRevision) throw new ProtocolError(ProtocolErrorCode.REVISION_CONFLICT)
    if (document.version < current.version) throw new ProtocolError(ProtocolErrorCode.SNAPSHOT_VERSION_BEHIND)

    const newRevision = current.revision + 1

    const result = store.db
      .prepare(
        `UPDATE snapshot SET revision = ?, version = ?, hash = ?, updated_at = ?, written_by_device_id = ?, written_at = ?, document = ?
         WHERE id = 1 AND revision = ?`,
      )
      .run(
        newRevision,
        document.version,
        document.meta.hash,
        document.meta.updatedAt,
        writtenByDeviceId,
        new Date().toISOString(),
        JSON.stringify(document),
        current.revision,
      )

    if (result.changes !== 1) throw new ProtocolError(ProtocolErrorCode.REVISION_CONFLICT)

    return String(newRevision)
  })

  return write.immediate()
}

function toStoredSnapshot(row: SnapshotRow): StoredSnapshot {
  return {
    revision: String(row.revision),
    version: row.version,
    hash: row.hash,
    updatedAt: row.updated_at,
    writtenByDeviceId: row.written_by_device_id,
    writtenAt: row.written_at,
    document: JSON.parse(row.document) as StoredSnapshotDocument,
  }
}
