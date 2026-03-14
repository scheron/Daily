# 04 — Contracts: SQLite Migration

**Date:** 2026-03-14
**Scope:** Complete interface contracts for PouchDB-to-SQLite migration.

---

## 1. Unchanged Contracts

### 1.1 IStorageController Interface

**File:** `src/main/types/storage.ts`

**No change.** All 40+ method signatures remain identical. The interface is the public facade; only internal implementation changes.

### 1.2 IPC Channels

**File:** `src/main/setup/ipc/storage.ts`

**No change.** All 35 `ipcMain.handle` registrations remain identical.

| Category | Channels                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings | `settings:load`, `settings:save`                                                                                                                                                                                                                                                                    |
| Days     | `days:get-many`, `days:get-one`                                                                                                                                                                                                                                                                     |
| Tasks    | `tasks:get-many`, `tasks:get-one`, `tasks:update`, `tasks:toggle-minimized`, `tasks:create`, `tasks:move-by-order`, `tasks:move-to-branch`, `tasks:delete`, `tasks:get-deleted`, `tasks:restore`, `tasks:delete-permanently`, `tasks:delete-all-permanently`, `tasks:add-tags`, `tasks:remove-tags` |
| Branches | `branches:get-many`, `branches:get-one`, `branches:create`, `branches:update`, `branches:delete`, `branches:set-active`                                                                                                                                                                             |
| Search   | `search:query`                                                                                                                                                                                                                                                                                      |
| Tags     | `tags:get-many`, `tags:get-one`, `tags:update`, `tags:create`, `tags:delete`                                                                                                                                                                                                                        |
| Files    | `files:save`, `files:delete`, `files:get-path`                                                                                                                                                                                                                                                      |
| Sync     | `storage-sync:activate`, `storage-sync:deactivate`, `storage-sync:sync`, `storage-sync:get-status`                                                                                                                                                                                                  |

### 1.3 Event Broadcasts

**File:** `src/main/setup/app/storage.ts` — **No change.**

| Event                         | Payload                                        | Direction       |
| ----------------------------- | ---------------------------------------------- | --------------- |
| `storage-sync:status-changed` | `(status: SyncStatus, prevStatus: SyncStatus)` | Main → Renderer |
| `storage-sync:data-changed`   | None                                           | Main → Renderer |

### 1.4 Domain Types (Shared)

**No change.** All types consumed by renderer:

- `Task` (with `tags: Tag[]`, `attachments: string[]`)
- `TaskInternal` (with `tags: ID[]`)
- `Tag`, `Branch`, `File`, `Day`, `Settings`
- `TaskStatus`, `SyncStatus`, `LayoutType`, `TaskMoveMode`, `TaskMovePosition`
- `ISODate`, `ISOTime`, `ISODateTime`, `Timezone`, `ID`
- `SearchMatch`, `TaskSearchResult`, `MoveTaskByOrderParams`

### 1.5 Custom Protocol Scheme

**File:** `src/main/setup/security/protocols.ts` — **No change** to scheme registration, URL parsing, or routing. Only `createFileResponse` internals change.

### 1.6 Preload Bridge, Renderer Stores, SearchService Interface

**No change.**

---

## 2. New Contracts

### 2.1 SQLite Database Module

**File:** `src/main/storage/database/instance.ts` (NEW)

```typescript
import type Database from "better-sqlite3"

/**
 * Initialize SQLite database. Creates file/dirs if needed.
 * PRAGMAs: journal_mode=WAL, foreign_keys=ON, busy_timeout=5000,
 *          synchronous=NORMAL, journal_size_limit=67108864
 * Runs all pending migrations.
 * Module-level singleton.
 */
export function initDatabase(dbPath: string): Database.Database

/** Returns singleton. Throws if not initialized. */
export function getDatabase(): Database.Database

/** Closes connection, clears singleton. Safe to call multiple times. */
export function closeDatabase(): void
```

### 2.2 Migration System

**File:** `src/main/storage/database/scripts/migrate.ts` (NEW)

```typescript
import type Database from "better-sqlite3"

type Migration = {
  version: number
  name: string
  up: string // Forward SQL
  down: string // Rollback SQL
}

type MigrationRecord = {
  version: number
  name: string
  applied_at: string // ISODateTime
}

/**
 * Run all pending migrations. Creates _migrations table if needed.
 * Each migration in its own transaction.
 */
export function runMigrations(db: Database.Database): void

/** Roll back most recent migration. Returns version rolled back, or null. */
export function rollbackLastMigration(db: Database.Database): number | null

/** Returns all applied migrations in order. */
export function getAppliedMigrations(db: Database.Database): MigrationRecord[]
```

**File:** `src/main/storage/database/migrations/index.ts` (NEW)

```typescript
export const migrations: Migration[]
```

### 2.3 Assets Module

**File:** `src/main/storage/models/FileModel.ts` (REWRITTEN)

```typescript
import type { ReadStream } from "node:fs"
import {fsPaths, APP_CONFIG} from '@/config'

// Rework with new assets approach
export class FileModel {
  // ...

  /** Ensure assets directory exists. */
  function initAssets(assetsDir: string): void

  /** Write binary data to disk. Path: assets/{fileId}.{ext} */
  function saveAsset(fileId: string, ext: string, data: Buffer): Promise<void>

  /** Open readable stream for zero-copy serving. */
  function readAssetStream(fileId: string, ext: string): ReadStream

  /** Read asset into Buffer. */
  function readAssetBuffer(fileId: string, ext: string): Promise<Buffer>

  /** Delete asset file. No-op if missing. */
  function deleteAsset(fileId: string, ext: string): Promise<void>

  /** List all asset filenames ({fileId}.{ext}). */
  function listAssets(): Promise<string[]>

  /** Remove files not in validFileIds set. Returns count removed. */
  function cleanupOrphanAssets(validFileIds: Set<string>): Promise<number>

  /** Resolve absolute path for an asset. */
  function getAssetPath(fileId: string, ext: string): string
}
```

### 2.4 Model Contracts (SQLite-based)

All models receive `Database` via constructor. All use prepared statements. No TTL caches, no `withRetryOnConflict`, no `AsyncMutex`.

#### 2.4.1 TaskModel

**File:** `src/main/storage/models/TaskModel.ts` (REWRITTEN)

```typescript
import type Database from "better-sqlite3"

type TaskRow = {
  id: string
  status: string
  content: string
  minimized: number          // 0 | 1
  order_index: number
  scheduled_date: ISODate // local user date in iso format
  scheduled_time: ISOTime // local user time in iso format
  scheduled_timezone: string
  estimated_time: number
  spent_time: number
  branch_id: string
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
  tags_json: string | null // ??? for whhat? maybe better use join
  attachments_json: string | null // ??? for what? attachements need as meta data
}

export class TaskModel {
  constructor(db: Database.Database)

  /** Fetch tasks with hydrated tags/attachments via SQL JOINs. */
  getTaskList(params?: {
    from?: ISODate; to?: ISODate; limit?: number
    branchId?: ID; includeDeleted?: boolean
  }): Task[]

  /** Single task by ID with hydrated tags/attachments. */
  getTask(id: ID): Task | null

  /** Insert task + associations in transaction. Returns hydrated Task. */
  createTask(task: Omit<TaskInternal, "id" | "createdAt" | "updatedAt">): Task | null

  /** Update task fields + associations in transaction. Returns hydrated Task. */
  updateTask(id: ID, updates: Partial<TaskInternal>): Task | null

  /** Soft-delete: SET deleted_at = now(). */
  deleteTask(id: ID): boolean

  /** Fetch soft-deleted tasks (excluding epoch sentinel). */
  getDeletedTasks(params?: { limit?: number; branchId?: ID }): Task[]

  /** Restore: SET deleted_at = NULL. */
  restoreTask(id: ID): Task | null

  /** Permanent delete: SET deleted_at = epoch sentinel. */
  permanentlyDeleteTask(id: ID): boolean

  /** Permanently delete all soft-deleted tasks. Returns count. */
  permanentlyDeleteAllDeletedTasks(branchId?: ID): number

  /** Add tag associations. INSERT OR IGNORE. */
  addTaskTags(taskId: ID, tagIds: ID[]): Task | null

  /** Remove tag associations. DELETE FROM task_tags. */
  removeTaskTags(taskId: ID, tagIds: ID[]): Task | null

  /** Add attachment association. INSERT OR IGNORE. */
  addTaskAttachment(taskId: ID, fileId: ID): Task | null

  /** Remove attachment association. */
  removeTaskAttachment(taskId: ID, fileId: ID): Task | null
}

**File:** `src/main/storage/models/_mappers.ts` (REWRITTEN)
/** Row → Task mapping (internal). */
function rowToTask(row: TaskRow): Task
```

#### 2.4.2 TagModel

**File:** `src/main/storage/models/TagModel.ts` (REWRITTEN)

```typescript
type TagRow = {
  id: string
  name: string
  color: string
  sort_order: number | null // No need
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
}

export class TagModel {
  constructor(db: Database.Database)

  getTagList(params?: {includeDeleted?: boolean}): Tag[]
  getTag(id: ID): Tag | null
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Tag | null
  updateTag(id: ID, updates: Partial<Pick<Tag, "color" | "name">>): Tag | null

  /** Soft-delete tag + DELETE FROM task_tags in transaction. */
  deleteTag(id: ID): boolean
}
```

#### 2.4.3 BranchModel

**File:** `src/main/storage/models/BranchModel.ts` (REWRITTEN)

```typescript
export class BranchModel {
  constructor(db: Database.Database)

  /** INSERT OR IGNORE 'main' branch. Restore if soft-deleted. */
  ensureMainBranch(): void

  getBranchList(params?: {includeDeleted?: boolean}): Branch[]
  getBranch(id: ID, params?: {includeDeleted?: boolean}): Branch | null
  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Branch | null

  /** Guards: cannot update 'main'. */
  updateBranch(id: ID, updates: Pick<Branch, "name">): Branch | null

  /** Guards: cannot delete 'main'. */
  deleteBranch(id: ID): boolean
}
```

#### 2.4.4 FileModel

**File:** `src/main/storage/models/FileModel.ts` (REWRITTEN)

```typescript
export class FileModel {
  constructor(db: Database.Database)

  getFileList(params?: {includeDeleted?: boolean}): AppFile[]
  getFiles(ids: ID[]): AppFile[]

  /** Insert metadata. Binary stored via Assets module, NOT in DB. */
  createFile(id: ID, name: string, mimeType: string, size: number): AppFile | null

  getFile(id: ID): AppFile | null
  deleteFile(id: ID): boolean

  /** SELECT DISTINCT file_id FROM task_attachments. For orphan detection. */
  getReferencedFileIds(): Set<ID>

  // ... and new assets approach methods
}
```

#### 2.4.5 SettingsModel

**File:** `src/main/storage/models/SettingsModel.ts` (REWRITTEN)

```typescript
export class SettingsModel {
  constructor(db: Database.Database)

  /** SELECT data FROM settings WHERE id='default'. Deep-merge with defaults. No mutex. */
  loadSettings(): Settings

  /** INSERT OR REPLACE with ON CONFLICT UPDATE. Deep-merge before write. No mutex. */
  saveSettings(newSettings: Partial<Settings>): void
}
```

### 2.5 Snapshot v2 Format

**File:** `src/main/types/sync.ts` (CHANGED)

```typescript
// ---- v2 Types (NEW) ----

type SnapshotV2 = {
  version: 2
  docs: SnapshotV2Docs
  meta: SnapshotMeta
}

type SnapshotV2Docs = {
  tasks: SnapshotTask[]
  tags: SnapshotTag[]
  branches: SnapshotBranch[]
  files: SnapshotFile[]
  settings: SnapshotSettings | null
}

type SnapshotTask = {
  id: string
  status: string
  content: string
  minimized: boolean
  order_index: number
  scheduled_date: ISODate
  scheduled_time: ISOTime
  scheduled_timezone: string
  estimated_time: number
  spent_time: number
  branch_id: string
  tags: string[] // tag IDs
  attachments: string[] // file IDs
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
}

type SnapshotTag = {
  id: string
  name: string
  color: string
  sort_order: number | null // no need
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
}

type SnapshotBranch = {
  id: string
  name: string
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
}

type SnapshotFile = {
  id: string
  name: string
  mime_type: string
  size: number
  created_at: ISODateTime
  updated_at: ISODateTime
  deleted_at: ISODateTime | null
}

type SnapshotSettings = {
  id: string // always "default"
  version: string
  data: string // JSON-encoded Settings
  created_at: ISODateTime
  updated_at: ISODateTime
}

// ---- Shared ----
type SnapshotMeta = {
  updatedAt: ISODateTime
  hash: string
}

// ---- v1 Backward Compat ----
type SnapshotV1 = {
  version?: undefined // absent in v1
  docs: {tasks: any[]; tags: any[]; branches: any[]; files: any[]; settings: any | null}
  meta: SnapshotMeta
}

type Snapshot = SnapshotV1 | SnapshotV2

function detectSnapshotVersion(snapshot: Snapshot): 1 | 2
```

### 2.6 PouchDB-to-SQLite Migration

**File:** `src/main/storage/database/scripts/pouchdb-to-sqlite.ts` (NEW)

```typescript
import type Database from "better-sqlite3"

type MigrationResult = {
  success: boolean
  counts: {
    tasks: number
    tags: number
    branches: number
    files: number
    settings: boolean
    taskTags: number
    taskAttachments: number
    fileAssets: number
  }
  warnings: string[]
  durationMs: number
}

/**
 * One-time migration. Algorithm:
 * 1. Open PouchDB, allDocs with attachments
 * 2. Categorize by type, strip _id prefixes, strip _rev
 * 3. Skip permanently deleted (deletedAt = epoch)
 * 4. Map fields to SQL columns (flatten scheduled, convert boolean→int)
 * 5. Extract base64 file data → disk
 * 6. All SQL in single transaction
 */
export function migratePouchDBToSQLite(pouchdbPath: string, sqliteDb: Database.Database, assetsDir: string): Promise<MigrationResult>

/** Check if migration needed: PouchDB exists + SQLite empty + no flag. */
export function isMigrationNeeded(pouchdbPath: string, sqliteDb: Database.Database): boolean

/** Write .migrated flag file. */
export function markMigrationComplete(dbDir: string, result: MigrationResult): Promise<void>
```

### 2.7 DaysService (Simplified)

**File:** `src/main/storage/services/DaysService.ts` (SIMPLIFIED)

```typescript
export class DaysService {
  constructor(taskModel: TaskModel, tagModel: TagModel)

  /**
   * Delegates to TaskModel.getTaskList (tags hydrated via SQL),
   * then groups into Day[] via single O(N) pass.
   */
  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: ID}): Day[]

  getDay(date: ISODate, params?: {branchId?: ID}): Day | null
}
```

---

## 3. Changed Contracts

### 3.1 LocalStorageAdapter

**File:** `src/main/storage/sync/adapters/LocalStorageAdapter.ts`

**What changed:** SQL read/write instead of PouchDB. No `withRetryOnConflict`. Produces SnapshotV2Docs.

```typescript
interface ILocalStorage {
  /** Export all data from SQLite as SnapshotV2Docs. */
  loadAllDocs(): Promise<SnapshotV2Docs>

  /** Import merged data. INSERT OR REPLACE in transaction. */
  upsertDocs(docs: SnapshotV2Docs): Promise<void>

  /** Hard-delete by typed IDs. */
  deleteDocs(ids: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void>
}
```

**Breaking:** `deleteDocs` parameter changes from `string[]` to typed object. Internal contract only.

### 3.2 RemoteStorageAdapter

**File:** `src/main/storage/sync/adapters/RemoteStorageAdapter.ts`

**What changed:** Atomic write, retry with backoff, `.icloud` handling, v1/v2 reading, asset sync.

```typescript
interface IRemoteStorage {
  /**
   * Load with iCloud edge case handling:
   * 1. Check .icloud placeholder
   * 2. Read with retry (3x, exponential backoff: 500ms, 1s, 2s)
   * 3. Validate JSON, detect version
   */
  loadSnapshot(): Promise<Snapshot | null>

  /** Atomic write: temp file + rename. Always writes v2. */
  saveSnapshot(snapshot: SnapshotV2): Promise<void>

  /** Sync file assets between local assets/ and sync/assets/. */
  syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void>
}
```

### 3.3 SyncEngine

**File:** `src/main/storage/sync/SyncEngine.ts`

**What changed:** AsyncMutex on `_sync()`, v1→v2 conversion, asset sync after merge.

```typescript
class SyncEngine {
  private mutex: AsyncMutex

  async sync(strategy: SyncStrategy = "pull"): Promise<void> {
    await this.mutex.runExclusive(async () => {
      // setStatus, _sync, setStatus
    })
  }

  private async _sync(strategy: SyncStrategy): Promise<void>
  // Now: v1→v2 conversion, asset sync via remoteStore.syncAssets()
}
```

### 3.4 mergeSettings

**File:** `src/main/utils/sync/merge/mergeSettings.ts`

**What changed:** Accepts `strategy` param. Remote wins tie on pull (unified with mergeCollections).

```typescript
// Before: mergeSettings(local, remote) — local wins tie
// After:
function mergeSettings(local: SnapshotSettings | null, remote: SnapshotSettings | null, strategy: SyncStrategy): SnapshotSettings | null
```

### 3.5 mergeRemoteIntoLocal

**File:** `src/main/utils/sync/merge/mergeRemoteIntoLocal.ts`

**What changed:** Operates on SnapshotV2Docs. Typed upsert/delete targets. Passes strategy to mergeSettings.

```typescript
interface MergeResult {
  resultDocs: SnapshotV2Docs
  toUpsert: {
    tasks: SnapshotTask[]
    tags: SnapshotTag[]
    branches: SnapshotBranch[]
    files: SnapshotFile[]
    settings: SnapshotSettings | null
  }
  toRemove: {
    tasks: string[]
    tags: string[]
    branches: string[]
    files: string[]
  }
  changes: Set<"tasks" | "tags" | "branches" | "files" | "settings">
}

function mergeRemoteIntoLocal(localDocs: SnapshotV2Docs, remoteDocs: SnapshotV2Docs, strategy: SyncStrategy, gcIntervalMs: number): MergeResult
```

### 3.6 mergeCollections

**File:** `src/main/utils/sync/merge/mergeCollections.ts`

**What changed:** Keyed by `id` instead of `_id`. Same LWW logic.

```typescript
function mergeCollections<T extends {id: string; updated_at: string; deleted_at: string | null}>(
  localDocs: T[],
  remoteDocs: T[],
  strategy: SyncStrategy,
  gcIntervalMs: number,
): {result: T[]; toUpsert: T[]; toRemove: string[]}
```

### 3.7 buildSnapshot

**File:** `src/main/utils/sync/snapshot/buildSnapshot.ts`

**What changed:** v2 format. Hash sorts by `id` (not `_id`), no `_attachments` stripping needed.

```typescript
function buildSnapshot(docs: SnapshotV2Docs): SnapshotV2
```

### 3.8 isValidSnapshot

**File:** `src/main/utils/sync/snapshot/isValidSnapshot.ts`

**What changed:** Validates both v1 and v2 formats.

```typescript
function isValidSnapshot(snapshot: unknown): snapshot is Snapshot
```

### 3.9 Config

**File:** `src/main/config.ts`

**What changed:** `app.getPath("home")` instead of `process.env.HOME`. New path getters.

```typescript
const fsPaths = {
  // Existing (unchanged)
  appDataRoot: () => string,
  remoteSyncPath: () => string,
  // Changes
  oldDbPath: () => string, // Old PouchDB path — kept for migration detection

  // New
  dbPath: () => string, // ~/Library/Application Support/Daily/db/daily.sqlite
  assetsDir: () => string, // ~/Library/Application Support/Daily/assets
  remoteSyncAssetsPath: () => string, // iCloud Drive/Daily/assets
}
```

### 3.10 FilesService

**File:** `src/main/storage/services/FilesService.ts`

**What changed:** Binary data on disk via Assets. Streaming response.

```typescript
class FilesService {
  /** Generate ID, write to disk via saveAsset, INSERT metadata via fileModel. */
  async saveFile(filename: string, data: Buffer): Promise<ID>

  /** Metadata from SQL, buffer from disk, 404 if deleted. */
  async createFileResponse(id: ID): Promise<Response>

  /** SQL getReferencedFileIds + cleanupOrphanAssets + DELETE stale metadata. */
  async cleanupOrphanFiles(): Promise<void>
}
```

### 3.11 Deleted Utilities

| Utility               | File                                    | Reason                                        |
| --------------------- | --------------------------------------- | --------------------------------------------- |
| `withRetryOnConflict` | `src/main/utils/withRetryOnConflict.ts` | SQLite transactions replace PouchDB 409 retry |
| `createCacheLoader`   | `src/main/utils/createCacheLoader.ts`   | SQLite fast enough without TTL caches         |
| `_mappers.ts`         | `src/main/storage/models/_mappers.ts`   | PouchDB doc ID prefix logic removed           |

`AsyncMutex` **RETAINED** — moved from SettingsModel to SyncEngine.

---

## 4. Database Schema

### 4.1 Migration v001: Initial Schema (up)

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'done', 'discarded')),
  content TEXT NOT NULL DEFAULT '',
  minimized INTEGER NOT NULL DEFAULT 0,
  order_index REAL NOT NULL DEFAULT 0,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  scheduled_timezone TEXT NOT NULL,
  estimated_time INTEGER NOT NULL DEFAULT 0,
  spent_time INTEGER NOT NULL DEFAULT 0,
  branch_id TEXT NOT NULL DEFAULT 'main'
    REFERENCES branches(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE task_attachments (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, file_id)
);

CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  version TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
CREATE INDEX idx_task_attachments_file ON task_attachments(file_id);
CREATE INDEX idx_tags_active ON tags(id) WHERE deleted_at IS NULL;

-- Seed main branch
INSERT OR IGNORE INTO branches (id, name, created_at, updated_at)
  VALUES ('main', 'Main', datetime('now'), datetime('now'));
```

### 4.2 Migration v001: Rollback (down)

```sql
DROP INDEX IF EXISTS idx_tags_active;
DROP INDEX IF EXISTS idx_task_attachments_file;
DROP INDEX IF EXISTS idx_task_tags_tag;
DROP INDEX IF EXISTS idx_tasks_deleted;
DROP INDEX IF EXISTS idx_tasks_status;
DROP INDEX IF EXISTS idx_tasks_date;
DROP INDEX IF EXISTS idx_tasks_branch_date;
DROP TABLE IF EXISTS task_attachments;
DROP TABLE IF EXISTS task_tags;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS branches;
```

### 4.3 FK Cascade Behavior

| Source           | Column    | Target       | ON DELETE                                            |
| ---------------- | --------- | ------------ | ---------------------------------------------------- |
| tasks            | branch_id | branches(id) | NO ACTION (deliberate — branch delete ≠ task delete) |
| task_tags        | task_id   | tasks(id)    | CASCADE                                              |
| task_tags        | tag_id    | tags(id)     | CASCADE                                              |
| task_attachments | task_id   | tasks(id)    | CASCADE                                              |
| task_attachments | file_id   | files(id)    | CASCADE                                              |

---

## 5. Directory Structure Changes

```
~/Library/Application Support/Daily/
├── db/
│   ├── daily.sqlite              # NEW: SQLite database
│   ├── .migrated                 # NEW: migration flag (JSON)
│   └── (PouchDB LevelDB files)  # KEPT until Phase 5
├── assets/                       # NEW: local file storage
│   ├── {fileId}.{ext}
│   └── ...

~/Library/Mobile Documents/com~apple~CloudDocs/Daily/
├── snapshot.v2.json                 # CHANGED: v2 format (no binary)
├── snapshot.json                 # OLD: v1 format for backward-compatibility
├── assets/                       # NEW: synced file binaries
│   ├── {fileId}.{ext}
│   └── ...
```

---

## 6. Dependency Changes

| Action           | Package                 | Version  |
| ---------------- | ----------------------- | -------- |
| ADD              | `better-sqlite3`        | `latest` |
| ADD (dev)        | `@types/better-sqlite3` | `latest` |
| REMOVE (Phase 5) | `pouchdb`               | `^9.0.0` |
| REMOVE (Phase 5) | `pouchdb-find`          | `^9.0.0` |
| REMOVE (Phase 5) | `@types/pouchdb`        | `^6.4.2` |
