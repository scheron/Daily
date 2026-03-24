import type {Settings} from "@shared/types/storage"

// --- Strategy ---

export type SyncStrategy = "pull" | "push"

// --- Snapshot types ---

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

// --- Delta sync types ---

export type ChangeOperation = "insert" | "update" | "delete"

export type ChangeEntity = "task" | "tag" | "branch" | "file" | "settings"

export type MergeOutcome = "local_wins" | "remote_wins" | "both_applied" | "no_conflict"

export type SyncAuditOutcome = "success" | "partial" | "error" | "no_changes"

export type ChangeLogEntry = {
  id: number
  doc_id: string
  entity: ChangeEntity
  operation: ChangeOperation
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_at: string
  sequence: number
  device_id: string
  synced: 0 | 1
}

export type DeltaRecord = {
  doc_id: string
  entity: ChangeEntity
  operation: ChangeOperation
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_at: string
  sequence: number
  device_id: string
}

export type DeltaFile = {
  version: 3
  device_id: string
  sequence_from: number
  sequence_to: number
  created_at: string
  deltas: DeltaRecord[]
}

export type DeviceManifest = {
  version: 3
  device_id: string
  device_name: string
  last_sequence: number
  last_written_at: string
  cursors: Record<string, number>
}

export type Snapshot = {
  version: 3
  docs: SnapshotDocs
  meta: SnapshotMeta
}

export type SnapshotMeta = {
  created_at: string
  hash: string
  watermarks: Record<string, number>
}

export type FieldConflict = {
  entity: ChangeEntity
  doc_id: string
  field_name: string
  local_value: string | null
  remote_value: string | null
  local_changed_at: string
  remote_changed_at: string
  outcome: MergeOutcome
  resolved_value: string | null
}

export type DeltaMergeResult = {
  remote_deltas_processed: number
  docs_upserted: number
  docs_deleted: number
  conflicts: FieldConflict[]
  conflict_count: number
  updated_cursors: Record<string, number>
}

export type SyncAuditEntry = {
  id: number
  started_at: string
  completed_at: string
  duration_ms: number
  strategy: SyncStrategy
  outcome: SyncAuditOutcome
  deltas_pushed: number
  deltas_pulled: number
  conflicts_resolved: number
  docs_upserted: number
  docs_deleted: number
  error_message: string | null
  device_id: string
}

export type SyncConfig = {
  remoteSyncInterval: number
  garbageCollectionInterval: number
  maxDeltasPerFile: number
  compactionThreshold: number
  auditRetentionInterval: number
  auditMaxEntries: number
}

// --- Adapter interfaces ---

export interface ILocalStorage {
  loadAllDocs(): Promise<SnapshotDocs>

  // Change log operations
  getUnsyncedChanges(): Promise<ChangeLogEntry[]>
  getChangesSince(deviceId: string, afterSequence: number): Promise<ChangeLogEntry[]>
  markChangesSynced(upToSequence: number): Promise<void>
  applyRemoteDeltas(deltas: DeltaRecord[], strategy: SyncStrategy): Promise<DeltaMergeResult>

  // Audit trail operations
  writeSyncAudit(entry: Omit<SyncAuditEntry, "id">): Promise<void>
  getSyncAuditLog(limit?: number): Promise<SyncAuditEntry[]>
  pruneSyncAudit(retentionMs: number, maxEntries: number): Promise<number>

  // Device identity
  getDeviceId(): Promise<string>
}

export interface IRemoteStorage {
  syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void>

  // Baseline operations
  loadBaseline(): Promise<Snapshot | null>
  saveBaseline(snapshot: Snapshot): Promise<void>

  // Delta operations
  listDeviceManifests(): Promise<DeviceManifest[]>
  loadDeviceManifest(deviceId: string): Promise<DeviceManifest | null>
  saveDeviceManifest(manifest: DeviceManifest): Promise<void>
  loadDeltas(deviceId: string, afterSequence: number): Promise<DeltaRecord[]>
  saveDeltaFile(deltaFile: DeltaFile): Promise<void>
  pruneDeltas(watermarks: Record<string, number>): Promise<number>
}
