export type SyncStrategy = "pull" | "push"

export type SnapshotMeta = {
  updatedAt: string
  hash: string
}

export type Snapshot = {
  version: 2 | 3 | 4 | 5 | 6 | 7 | 8
  docs: SnapshotDocs
  meta: SnapshotMeta
}

export type SnapshotDocs = {
  tasks: SnapshotTask[]
  tags: SnapshotTag[]
  branches: SnapshotBranch[]
  milestones: SnapshotMilestone[]
  relations: SnapshotTaskRelation[]
  comments: SnapshotTaskComment[]
  files: SnapshotFile[]
  events: SnapshotTaskEvent[]
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

export type SnapshotTag = {
  id: string
  branch_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotBranch = {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotMilestone = {
  id: string
  branch_id: string
  name: string
  description: string
  target_date: string | null
  order_index: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotTaskRelation = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SnapshotTaskComment = {
  id: string
  task_id: string
  branch_id: string
  content: string
  kind: string
  provider: string | null
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

export type MergeResult = {
  resultDocs: SnapshotDocs
  toUpsert: SnapshotDocs
  toRemove: {
    tasks?: string[]
    tags?: string[]
    branches?: string[]
    milestones?: string[]
    relations?: string[]
    comments?: string[]
    files?: string[]
  }
  changes: number
}

export interface ILocalStorage {
  loadAllDocs(): Promise<SnapshotDocs>
  upsertDocs(docs: SnapshotDocs): Promise<void>
  deleteDocs(ids: {
    tasks?: string[]
    tags?: string[]
    branches?: string[]
    milestones?: string[]
    relations?: string[]
    comments?: string[]
    files?: string[]
  }): Promise<void>
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
