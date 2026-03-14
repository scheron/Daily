export type SyncStrategy = "pull" | "push"

export type SnapshotMeta = {
  updatedAt: string
  hash: string
}

// --- Snapshot V2 types ---

export type SnapshotV2 = {
  version: 2
  docs: SnapshotV2Docs
  meta: SnapshotMeta
}

export type SnapshotV2Docs = {
  tasks: SnapshotTask[]
  tags: SnapshotTag[]
  branches: SnapshotBranch[]
  files: SnapshotFile[]
  settings: SnapshotSettings | null
}

export type SnapshotTask = {
  id: string
  status: string
  content: string
  minimized: boolean
  order_index: number
  scheduled_date: string
  scheduled_time: string
  scheduled_timezone: string
  estimated_time: number
  spent_time: number
  branch_id: string
  tags: string[]
  attachments: string[]
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

export type SnapshotSettings = {
  id: string
  version: string
  data: string
  created_at: string
  updated_at: string
}

// --- Snapshot V1 types (backward compat) ---

export type SnapshotV1 = {
  version?: undefined
  docs: {tasks: any[]; tags: any[]; branches: any[]; files: any[]; settings: any | null}
  meta: SnapshotMeta
}

export type Snapshot = SnapshotV1 | SnapshotV2

export function detectSnapshotVersion(snapshot: Snapshot): 1 | 2 {
  return snapshot.version === 2 ? 2 : 1
}

// --- Merge result ---

export type MergeResult = {
  resultDocs: SnapshotV2Docs
  toUpsert: SnapshotV2Docs
  toRemove: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}
  changes: number
}

// --- Adapter interfaces ---

export interface ILocalStorage {
  loadAllDocs(): Promise<SnapshotV2Docs>
  upsertDocs(docs: SnapshotV2Docs): Promise<void>
  deleteDocs(ids: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void>
}

export interface IRemoteStorage {
  loadSnapshot(): Promise<Snapshot | null>
  saveSnapshot(snapshot: SnapshotV2): Promise<void>
  syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void>
}
