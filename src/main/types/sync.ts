import type {Settings} from "@shared/types/storage"

export type SyncStrategy = "pull" | "push"

export type SnapshotMeta = {
  updatedAt: string
  hash: string
}

export type Snapshot = {
  version: 2
  docs: SnapshotDocs
  meta: SnapshotMeta
}

export type SnapshotDocs = {
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

export type SnapshotSettings = Settings & {
  id: string
  created_at: string
  updated_at: string
}

export type MergeResult = {
  resultDocs: SnapshotDocs
  toUpsert: SnapshotDocs
  toRemove: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}
  changes: number
}

export interface ILocalStorage {
  loadAllDocs(): Promise<SnapshotDocs>
  upsertDocs(docs: SnapshotDocs): Promise<void>
  deleteDocs(ids: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void>
}

export interface IRemoteStorage {
  loadSnapshot(): Promise<Snapshot | null>
  saveSnapshot(snapshot: Snapshot): Promise<void>
  syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void>
}
