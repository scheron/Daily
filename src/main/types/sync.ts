import type {ISODateTime} from "@shared/types/common"
import type {BaseDoc, BranchDoc, FileDoc, SettingsDoc, TagDoc, TaskDoc} from "./database"

export type SyncDoc = Omit<BaseDoc, "_rev"> & Record<string, any>

/**
 * SnapshotMeta contains metadata for quick comparison.
 * Stored inside Snapshot.meta (no separate file).
 */
export type SnapshotMeta = {
  /** ISO date time when snapshot was last updated */
  updatedAt: ISODateTime
  /** Combined hash of all document collections (Snapshot.docs) */
  hash: string
}

export type SnapshotDocs = {
  tasks: TaskDoc[]
  tags: TagDoc[]
  branches: BranchDoc[]
  files: FileDoc[]
  settings: SettingsDoc | null
}

/**
 * Snapshot represents the complete state with embedded metadata.
 * Single source of truth - stored in snapshot.json.
 * Documents with `deletedAt` !== null are soft-deleted.
 */
export type Snapshot = {
  docs: SnapshotDocs
  meta: SnapshotMeta
}

export type SyncStrategy = "pull" | "push"

export interface ILocalStorage {
  /**
   * Load all documents from PouchDB.
   * @returns all documents stripped of service fields (`_rev`)
   */
  loadAllDocs(): Promise<Snapshot["docs"]>

  /**
   * Create or update documents.
   * Adapter decides how to work with `_rev`, `updatedAt`, etc. inside PouchDB.
   */
  upsertDocs(docs: SyncDoc[]): Promise<void>

  /**
   * Hard delete documents by `_id` (for garbage collection).
   */
  deleteDocs(ids: string[]): Promise<void>
}

export interface IRemoteStorage {
  /**
   * Load complete snapshot from remote.
   * @returns null if remote is empty.
   */
  loadSnapshot(): Promise<Snapshot | null>

  /**
   * Save complete snapshot to remote.
   * Writes single `snapshot.json` @see Snapshot.
   */
  saveSnapshot(snapshot: Snapshot): Promise<void>
}
