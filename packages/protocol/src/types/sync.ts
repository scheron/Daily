import type {Settings} from "./storage"

export type SyncStrategy = "pull" | "push"

export type SnapshotMeta = {
  updatedAt: string
  hash: string
}

export type Snapshot = {
  version: 2 | 3 | 4 | 5 | 6
  docs: SnapshotDocs
  meta: SnapshotMeta
}

export type SnapshotDocs = {
  tasks: SnapshotTask[]
  milestones: SnapshotMilestone[]
  tags: SnapshotTag[]
  branches: SnapshotBranch[]
  files: SnapshotFile[]
  events: SnapshotTaskEvent[]
  settings: SnapshotSettings | null
}

export type SnapshotTaskEvent = {
  id: string
  task_id: string
  branch_id: string
  type: string
  event_date: string
  from_date: string | null
  to_date: string | null
  created_at: string
}

export type SnapshotTask = {
  id: string
  status: string
  content: string
  minimized: boolean
  order_index: number
  scheduled_date: string | null
  scheduled_time: string | null
  scheduled_timezone: string | null
  estimated_time: number
  spent_time: number
  branch_id: string
  milestone_id: string | null
  tags: string[]
  attachments: string[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotMilestone = {
  id: string
  branch_id: string
  name: string
  date: string | null
  description: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotTag = {
  id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotBranch = {
  id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotFile = {
  id: string
  name: string
  mime_type: string
  size: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotSettings = Omit<Settings, "sync" | "typography"> & {
  id: string
  created_at: string
  updated_at: string
}

export type MergeResult = {
  resultDocs: SnapshotDocs
  toUpsert: SnapshotDocs
  toRemove: {tasks?: string[]; milestones?: string[]; tags?: string[]; branches?: string[]; files?: string[]}
  changes: number
}

export interface ILocalStorage {
  loadAllDocs(): Promise<SnapshotDocs>
  upsertDocs(docs: SnapshotDocs): Promise<void>
  deleteDocs(ids: {tasks?: string[]; milestones?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void>
}

export interface IRemoteStorage {
  loadSnapshot(): Promise<Snapshot | null>
  saveSnapshot(snapshot: Snapshot): Promise<void>
  syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void>
}

export type SnapshotRevision = string

export type RemoteReadResult = {
  snapshot: Snapshot | null
  revision: SnapshotRevision | null
}

/**
 * A remote that supports conditional writes: it can be read together with the
 * revision it was read at, and written back only if that revision still
 * matches what the provider currently holds. `saveSnapshotIfUnchanged` rejects
 * with `RemoteWriteConflictError` when it does not.
 */
export interface IRevisionedRemoteStorage extends IRemoteStorage {
  readonly supportsRevisions: true
  loadSnapshotWithRevision(): Promise<RemoteReadResult>
  saveSnapshotIfUnchanged(snapshot: Snapshot, expectedRevision: SnapshotRevision | null): Promise<SnapshotRevision>
}

export type SyncRemote = {
  id: string
  label: string
  adapter: IRemoteStorage
}
