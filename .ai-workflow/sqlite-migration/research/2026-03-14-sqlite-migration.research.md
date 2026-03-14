---
date: 2026-03-14T16:19:00+00:00
branch: main
status: complete
---

# Research 2026-03-14: SQLite Migration — Current Storage Layer Documentation

## Research Question

Document the complete current state of the PouchDB-based storage layer, sync system, types, and build configuration as context for the SQLite migration epic defined in `docs/features/epic-sqlite-migration.md`.

## Summary

The Daily app uses a layered storage architecture: **StorageController** (facade) → **Services** (business logic, tag hydration, cross-model orchestration) → **Models** (PouchDB CRUD with TTL caches and retry-on-conflict) → **Mappers** (bidirectional Doc↔Domain transformation) → **PouchDB** (LevelDB-backed document store). iCloud sync operates via a `snapshot.json` file containing all documents (including base64-encoded file attachments) with LWW merge and a 5-minute auto-sync interval. The renderer communicates exclusively via IPC channels, and files are served through a custom `daily://file/{id}` protocol that decodes base64 from PouchDB `_attachments`.

---

## Detailed Findings

### 1. Database Initialization

**File:** `src/main/storage/database.ts`

- Module-level singleton pattern: `dbInstance` and `dbReadyPromise` ensure a single PouchDB instance per process lifetime.
- `getDB(dbPath)` sequence:
  1. `fs.ensureDir(dbDir)` — guarantees parent directory exists
  2. `new PouchDB(dbPath)` — no explicit adapter (defaults to LevelDB on Node.js), no WAL or custom options
  3. `createIndexes(db)` — 7 sequential `db.createIndex()` calls (idempotent on restart)
- DB path: `~/Library/Application Support/Daily/db` (resolved by `fsPaths.dbPath()` in `config.ts:133`)
- `PouchDB.plugin(PouchDBFind)` registered globally at module level before any instance

**Indexes created:**

| Index Fields                             |
| ---------------------------------------- |
| `["type"]`                               |
| `["type", "scheduled.date"]`             |
| `["type", "branchId"]`                   |
| `["type", "branchId", "scheduled.date"]` |
| `["type", "status"]`                     |
| `["type", "createdAt"]`                  |
| `["type", "updatedAt"]`                  |

Additional exports: `getDBInstance()` (synchronous), `closeDB()`, `destroyDB(dbPath)`.

---

### 2. Models Layer

All models receive a `PouchDB.Database` via constructor injection. No barrel/index file — imported directly.

#### Document ID Prefix Conventions (`_mappers.ts:13-34`)

| Document Type | `_id` Format       | Example            |
| ------------- | ------------------ | ------------------ |
| Task          | `task:{id}`        | `task:abc123`      |
| Tag           | `tag:{id}`         | `tag:xyz456`       |
| Branch        | `branch:{id}`      | `branch:main`      |
| Settings      | `settings:default` | (singleton, fixed) |
| File          | `file:{id}`        | `file:def789`      |

`toDoc(id)` / `fromDoc(id)` functions handle conversion. For settings, `toDoc()` always returns `"settings:default"`.

#### Shared Infrastructure

- **`withRetryOnConflict(label, operation, options?)`** (`src/main/utils/withRetryOnConflict.ts`): Wraps a callback in a retry loop (default 3 attempts). On PouchDB 409 conflict, retries. On final attempt, returns `null`. Non-409 errors are re-thrown.
- **`createCacheLoader(loadFn, ttlMs)`** (`src/main/utils/createCacheLoader.ts`): TTL-based cache with in-flight promise deduplication. Used by TagModel and BranchModel (5-minute TTL).
- **`AsyncMutex`** (`src/main/utils/AsyncMutex.ts`): Queued async mutex with `runExclusive(fn)` and `tryLock()`. Used exclusively by SettingsModel.

#### TaskModel (`src/main/storage/models/TaskModel.ts`)

No cache — all reads go directly to PouchDB.

| Method                      | PouchDB API                                  | Notes                                                                                                     |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `getTaskList(params?)`      | `db.find({selector, limit})`                 | Optional `from`/`to` on `scheduled.date`, `branchId`, `includeDeleted`; post-fetch filter for `deletedAt` |
| `getTask(id)`               | `db.get(docId)`                              | Returns `null` on 404                                                                                     |
| `createTask(task)`          | `db.put(doc)`                                | Generates `nanoid()` ID; NOT wrapped in `withRetryOnConflict`                                             |
| `updateTask(id, updates)`   | `db.get()` → `applyDiffToDoc()` → `db.put()` | Wrapped in `withRetryOnConflict("[TASK]")`                                                                |
| `deleteTask(id)`            | `db.get()` → set `deletedAt` → `db.put()`    | Soft-delete; wrapped in retry                                                                             |
| `getDeletedTasks(params?)`  | `db.find({selector})`                        | Post-fetch filter: excludes `_deleted` and `deletedAt < 2000-01-01` (epoch = permanent delete)            |
| `restoreTask(id)`           | `db.get()` → `deletedAt=null` → `db.put()`   | Wrapped in retry                                                                                          |
| `permanentlyDeleteTask(id)` | `db.get()` → `deletedAt=epoch` → `db.put()`  | Sets `deletedAt` to `1970-01-01T00:00:00.000Z` sentinel                                                   |

Private: `applyDiffToDoc(doc, updates)` — field-by-field copy, nested `scheduled` merge. `applyBranchSelector(selector, branchId)` — for `MAIN_BRANCH_ID`, adds `$or` to include docs with missing `branchId`.

#### TagModel (`src/main/storage/models/TagModel.ts`)

TTL cache: 5 minutes via `createCacheLoader`.

| Method                          | PouchDB API                                  | Notes                                            |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `invalidateCache()`             | —                                            | Clears cache loader                              |
| `getTagList({includeDeleted?})` | Cache → `db.find({type: "tag"})`             | Cache stores all tags; filtering applied at read |
| `getTag(id)`                    | `db.get(docId)`                              | Bypasses cache                                   |
| `createTag(tag)`                | `db.put(doc)`                                | Generates `nanoid()` ID; clears cache on success |
| `updateTag(id, updates)`        | `db.get()` → `applyDiffToDoc()` → `db.put()` | Retry; clears cache                              |
| `deleteTag(id)`                 | Soft-delete → `db.put()`                     | Retry; clears cache                              |

`applyDiffToDoc` handles only `color` and `deletedAt`.

#### BranchModel (`src/main/storage/models/BranchModel.ts`)

TTL cache: 5 minutes. Every public method (except `invalidateCache`) calls `ensureMainBranchDoc()` first.

| Method                             | PouchDB API                         | Notes                                  |
| ---------------------------------- | ----------------------------------- | -------------------------------------- |
| `getBranchList({includeDeleted?})` | Cache → `db.find({type: "branch"})` |                                        |
| `getBranch(id, {includeDeleted?})` | `db.get(docId)`                     | Bypasses cache                         |
| `createBranch(branch)`             | `db.put(doc)`                       | Generates `nanoid()` ID                |
| `updateBranch(id, updates)`        | Retry; read-modify-write            | Guards: no update for `MAIN_BRANCH_ID` |
| `deleteBranch(id)`                 | Soft-delete                         | Guards: no delete for `MAIN_BRANCH_ID` |

`ensureMainBranchDoc()`: gets or creates main branch doc; auto-restores if soft-deleted.

#### FileModel (`src/main/storage/models/FileModel.ts`)

No cache.

| Method                                   | PouchDB API                                         | Notes                                          |
| ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `getFileList({includeDeleted?})`         | `db.find({type: "file"})`                           | Metadata only                                  |
| `getFiles(ids)`                          | `db.allDocs({keys, include_docs: true})`            | Batch fetch                                    |
| `createFile(name, mimeType, size, data)` | `db.put(fileToDoc(file))`                           | Base64 encodes buffer into `_attachments.data` |
| `getFileWithAttachment(id)`              | `db.get(docId, {attachments: true, binary: false})` | Returns doc with base64 attachment data        |
| `deleteFile(id)`                         | Soft-delete → `db.put()`                            | Retry                                          |

#### SettingsModel (`src/main/storage/models/SettingsModel.ts`)

TTL cache via `createCacheLoader`. AsyncMutex guards `saveSettings()`.

| Method                      | PouchDB API                                                   | Notes                           |
| --------------------------- | ------------------------------------------------------------- | ------------------------------- |
| `loadSettings()`            | Cache → `db.get("settings:default")`                          | Returns default settings on 404 |
| `saveSettings(newSettings)` | `mutex.runExclusive()` → `db.get()` → deep merge → `db.put()` | Wrapped in both mutex AND retry |

#### Mappers (`src/main/storage/models/_mappers.ts`)

| Mapper                            | Key Transformations                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskToDoc` / `docToTask`         | ID prefix add/strip; `orderIndex` fallback to `Date.parse(createdAt)`; `branchId` default to `MAIN_BRANCH_ID`; `minimized` default to `false`; `attachments` default to `[]` |
| `tagToDoc` / `docToTag`           | ID prefix add/strip; `deletedAt` default to `null`                                                                                                                           |
| `branchToDoc` / `docToBranch`     | ID prefix add/strip                                                                                                                                                          |
| `settingsToDoc` / `docToSettings` | Full `Settings` → `data` field nesting; extensive defaults for all optional fields                                                                                           |
| `fileToDoc` / `docToFile`         | Base64 encode buffer → `_attachments.data.data`; `docToFile` returns metadata only                                                                                           |

---

### 3. Services Layer

Services sit between `StorageController` and models. No service emits events directly; `StorageController` manages all broadcasting.

**Instantiation dependency graph** (in `StorageController.init()`):

```
SettingsService(settingsModel)
BranchesService(branchModel, settingsService)
TasksService(taskModel, tagModel)
TagsService(taskModel, tagModel)
FilesService(fileModel)
DaysService(taskModel, tagModel)
SearchService(taskModel, tagModel, branchModel)
```

#### DaysService (`src/main/storage/services/DaysService.ts`)

**`getDays(params?)`** — the primary data assembly method:

1. Default date range: ±1 year from now
2. Parallel fetch: `taskModel.getTaskList({from, to, branchId})` + `tagModel.getTagList()`
3. Tag hydration: builds `Map<Tag["id"], Tag>`, maps each `TaskInternal.tags: string[]` → `Tag[]`, filters missing, sorts via `sortTags()`
4. Day grouping: `groupTasksByDay()` utility — buckets tasks by `scheduled.date`, accumulates per-day tag sets, returns `Day[]` sorted by `orderIndex`

**`getDay(date, params?)`** — delegates to `getDays({from: date, to: date})`, returns `days[0] ?? null`.

#### TasksService (`src/main/storage/services/TasksService.ts`)

Tag hydration pattern appears in every read method: parallel fetch tasks + all tags → build `Map<id, Tag>` → map → filter → sort.

| Method                                      | Cross-Model Logic                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `getTaskList(params?)`                      | Hydrates tags                                                                                                        |
| `getTask(id)`                               | Hydrates tags                                                                                                        |
| `updateTask(id, updates)`                   | Converts `updates.tags: Tag[]` → `string[]`; hydrates result                                                         |
| `createTask(task)`                          | Converts tags to IDs; hydrates result                                                                                |
| `moveTaskByOrder(params)`                   | Complex reorder: fetches all day tasks, computes insert index, `getOrderIndexBetween` or full normalization fallback |
| `moveTaskToBranch(taskId, branchId)`        | Updates `branchId` field                                                                                             |
| `deleteTask(id)`                            | Direct delegation                                                                                                    |
| `getDeletedTasks(params?)`                  | Hydrates tags                                                                                                        |
| `restoreTask(id)`                           | Hydrates result                                                                                                      |
| `permanentlyDeleteTask(id)`                 | Direct delegation                                                                                                    |
| `permanentlyDeleteAllDeletedTasks(params?)` | Sequential loop; returns array of deleted IDs                                                                        |
| `addTaskTags(taskId, tagIds)`               | Set-merge existing + new tag IDs → update → hydrated return                                                          |
| `removeTaskTags(taskId, tagIds)`            | Filter existing → update → hydrated return                                                                           |
| `addTaskAttachment(taskId, fileId)`         | Set-merge → update                                                                                                   |
| `removeTaskAttachment(taskId, fileId)`      | Filter → update                                                                                                      |

#### TagsService (`src/main/storage/services/TagsService.ts`)

Thin delegations except `deleteTag(id)`:

1. `tagModel.deleteTag(id)` — soft-delete the tag
2. `taskModel.getTaskList()` — fetch ALL tasks (no date filter)
3. For each task referencing the deleted tag: `taskModel.updateTask(task.id, {tags: filtered})`
4. `Promise.allSettled(ops)` — concurrent updates, logs success/failure counts

#### FilesService (`src/main/storage/services/FilesService.ts`)

| Method                      | Logic                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `saveFile(filename, data)`  | Extract extension, resolve MIME, delegate to `fileModel.createFile`                                         |
| `getFilePath(id)`           | Returns `daily://file/{id}` string                                                                          |
| `deleteFile(fileId)`        | Direct delegation                                                                                           |
| `getFiles(fileIds)`         | Direct delegation                                                                                           |
| `createFileResponse(id)`    | `fileModel.getFileWithAttachment(id)` → check `deletedAt` → base64 decode → `new Response(buffer, headers)` |
| `cleanupOrphanFiles(tasks)` | Build `Set` of referenced file IDs (from content + attachments) → find unreferenced → delete each           |

#### SearchService (`src/main/storage/services/SearchService.ts`)

Owns a `TaskSearchIndex` instance (in-memory).

| Method                         | Logic                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `initializeIndex()`            | Fetch all tasks, hydrate tags, load into search index                   |
| `searchTasks(query, options?)` | In-memory search → fetch full task per result → hydrate tags + branches |
| `addTaskToIndex(task)`         | Add to index                                                            |
| `updateTaskInIndex(task)`      | Update in index                                                         |
| `removeTaskFromIndex(taskId)`  | Remove from index                                                       |
| `rebuildIndex()`               | Re-fetches all data and rebuilds                                        |

---

### 4. StorageController (`src/main/storage/StorageController.ts`)

Facade implementing `IStorageController`. Initialization (`init()`):

1. `fs.ensureDir(rootDir)` — app data root
2. `getDB(dbPath)` — PouchDB singleton
3. Instantiate 5 models, 7 services
4. Instantiate sync engine with `RemoteStorageAdapter` + `LocalStorageAdapter`
5. Restore auto-sync if `settings.sync.enabled`
6. Initialize search index

All public methods are thin delegations. Mutations follow: call service → if success → `notifyStorageDataChange?.()` → update search index. Branch resolution (`resolveBranchId`) runs at controller level before passing to services.

---

### 5. IPC Layer (`src/main/setup/ipc/storage.ts`)

`setupStorageIPC(getStorage)` registers `ipcMain.handle` channels. Every handler calls `getStorage()?.methodName(...)`.

#### Complete IPC Channel Registry

**Settings:** `settings:load`, `settings:save`

**Days:** `days:get-many`, `days:get-one`

**Tasks:** `tasks:get-many`, `tasks:get-one`, `tasks:update`, `tasks:toggle-minimized`, `tasks:create`, `tasks:move-by-order`, `tasks:move-to-branch`, `tasks:delete`, `tasks:get-deleted`, `tasks:restore`, `tasks:delete-permanently`, `tasks:delete-all-permanently`, `tasks:add-tags`, `tasks:remove-tags`

**Branches:** `branches:get-many`, `branches:get-one`, `branches:create`, `branches:update`, `branches:delete`, `branches:set-active`

**Search:** `search:query`

**Tags:** `tags:get-many`, `tags:get-one`, `tags:update`, `tags:create`, `tags:delete`

**Files:** `files:save` (normalizes data to Buffer), `files:delete`, `files:get-path`

**Sync:** `storage-sync:activate`, `storage-sync:deactivate`, `storage-sync:sync`, `storage-sync:get-status`

**Event broadcasts** (renderer-bound via `webContents.send`, set up in `src/main/setup/app/storage.ts`):

- `storage-sync:status-changed` — `(status, prevStatus)` on sync status change
- `storage-sync:data-changed` — no payload, on any mutation

---

### 6. Custom Protocol (`daily://`)

**Scheme registration:** `src/main/setup/security/protocols.ts:31-33` — `protocol.registerSchemesAsPrivileged` with `standard: true`, `secure: true`, `supportFetchAPI: true`.

**Request handler:** `src/main/setup/security/protocols.ts:9-29` — `protocol.handle("daily", handler)`:

1. Parse URL → extract `hostname` and `pathname`
2. If `hostname === "file"`, `id = pathname.slice(1)`
3. Call `storage.createFileResponse(id)` → returns `Response`

**File response assembly** (`FilesService.createFileResponse`):

1. `fileModel.getFileWithAttachment(id)` — PouchDB doc with `_attachments`
2. Check `deletedAt` → 404 if soft-deleted
3. Read `_attachments.data.data` (base64 string)
4. `Buffer.from(base64Data, "base64")`
5. Return `new Response(buffer, {Content-Type, Content-Length})`

---

### 7. Sync System

#### Architecture

```
StorageController
    ↓
SyncEngine ← createIntervalScheduler (5-min interval)
    ↓                    ↓
LocalStorageAdapter   RemoteStorageAdapter
    ↓                    ↓
PouchDB              ~/Library/Mobile Documents/com~apple~CloudDocs/Daily/snapshot.json
```

#### Config (`src/main/config.ts`)

| Setting                          | Value                                                  |
| -------------------------------- | ------------------------------------------------------ |
| `sync.garbageCollectionInterval` | 7 days (ms)                                            |
| `sync.remoteSyncInterval`        | 5 minutes (ms)                                         |
| `iCloudPath`                     | `${HOME}/Library/Mobile Documents/com~apple~CloudDocs` |
| `fsPaths.remoteSyncPath()`       | `~/Library/Mobile Documents/com~apple~CloudDocs/Daily` |
| `fsPaths.dbPath()`               | `~/Library/Application Support/Daily/db`               |
| `fsPaths.appDataRoot()`          | `~/Library/Application Support/Daily`                  |

Uses `process.env.HOME` for iCloud path (not `app.getPath("home")`).

#### SyncEngine (`src/main/storage/sync/SyncEngine.ts`)

**`sync(strategy = "pull")`** — public entry:

1. Returns early if sync not enabled
2. Status → `"syncing"`
3. `withElapsedDelay(_sync(strategy), 1000)` — minimum 1s visible syncing state
4. Status → `"active"` / `"inactive"` / `"error"`

**`_sync(strategy)`** — core flow:

1. Parallel load: `localStore.loadAllDocs()` + `remoteStore.loadSnapshot()`
2. Hash comparison → early return if equal
3. `_pull(localDocs, remoteDocs, strategy)` → merge → upsert/delete local
4. If changes: `onDataChanged()` → invalidate caches → broadcast to renderer
5. `_shouldPush(resultDocs, remoteDocs)` → hash comparison
6. If needed: `_push(resultDocs)` → `saveSnapshot()`

**No AsyncMutex on `_sync()`** — `forceSync()` and auto-sync can overlap (guarded only by `createIntervalScheduler.isSyncing` for the scheduled path, not for manual calls).

#### LocalStorageAdapter (`src/main/storage/sync/adapters/LocalStorageAdapter.ts`)

**`loadAllDocs()`:**

- `db.allDocs({include_docs: true, attachments: true, binary: false})`
- Skips `_deleted` docs; dispatches by `doc.type` into typed arrays
- Strips `_rev` from each doc

**`upsertDocs(docs)`** — three-phase write:

1. `db.allDocs({keys: ids})` — get current `_rev` values
2. `db.bulkDocs(payload)` — batch write with correct `_rev`
3. Conflict resolution: `withRetryOnConflict("[SYNC-UPSERT]")` per-document LWW

**`deleteDocs(ids)`** — batch hard delete with conflict retry

#### RemoteStorageAdapter (`src/main/storage/sync/adapters/RemoteStorageAdapter.ts`)

- `snapshotPath` = `~/Library/Mobile Documents/com~apple~CloudDocs/Daily/snapshot.json`
- `loadSnapshot()`: `fs.readFile` → `JSON.parse` → validate → return `Snapshot | null`
- `saveSnapshot(snapshot)`: `ensureDir()` → `JSON.stringify(snapshot, null, 2)` → `fs.writeFile`
- No atomic write (no temp file + rename)
- No `.icloud` placeholder handling
- No `NSFileCoordinator`

#### Snapshot Format (`src/main/types/sync.ts`)

```typescript
interface Snapshot {
  docs: {
    tasks: TaskDoc[] // includes base64 file data in _attachments
    tags: TagDoc[]
    branches: BranchDoc[]
    files: FileDoc[] // includes base64 file data in _attachments
    settings: SettingsDoc | null
  }
  meta: {
    updatedAt: ISODateTime
    hash: string // SHA-256 of all collections combined
  }
}
```

**Hash computation** (`src/main/utils/sync/snapshot/buildSnapshot.ts`):

1. Per-collection: strip `_attachments` → sort by `_id` → `JSON.stringify` → SHA-256
2. Concatenate 5 hashes → SHA-256 combined

#### Merge Logic (`src/main/utils/sync/merge/`)

**`mergeRemoteIntoLocal(localDocs, remoteDocs, strategy, gcIntervalMs)`:**

- Calls `mergeCollections` for tasks, tags, branches, files + `mergeSettings` for settings
- Returns `{resultDocs, toUpsert, toRemove, changes}`
- Change detection: full-collection replacement per type if any doc changed

**`mergeCollections(localDocs, remoteDocs, strategy, gcIntervalMs)`:**

- Builds maps by `_id`, iterates union of all IDs
- GC: `isExpired(doc, now, ttlMs)` — `deletedAt + ttlMs <= now` (epoch = instant expire)
- Per-doc: `mergeDoc(local, remote, strategy)` — LWW by `updatedAt`
- **Tie-break:** `"push"` → local wins; `"pull"` → remote wins

**`mergeSettings(local, remote)`:**

- **Tie-break:** `isNewerOrEqual(local.updatedAt, remote.updatedAt) ? local : remote` — local always wins ties (no strategy parameter)

#### withRetryOnConflict — All Call Sites

| File                         | Label                            |
| ---------------------------- | -------------------------------- |
| `LocalStorageAdapter.ts:117` | `[SYNC-UPSERT]`                  |
| `LocalStorageAdapter.ts:192` | `[SYNC-DELETE]`                  |
| `TaskModel.ts:99`            | `[TASK]` (update)                |
| `TaskModel.ts:128`           | `[TASK]` (delete)                |
| `TaskModel.ts:194`           | `[TASK-RESTORE]`                 |
| `TaskModel.ts:231`           | `[TASK-PERMANENT-DELETE]`        |
| `TagModel.ts:82`             | `[TAG]` (update)                 |
| `TagModel.ts:113`            | `[TAG]` (delete)                 |
| `BranchModel.ts:91`          | `[BRANCH]` (update)              |
| `BranchModel.ts:129`         | `[BRANCH]` (delete)              |
| `FileModel.ts:82`            | `[FILE]` (delete)                |
| `SettingsModel.ts:115`       | `[SETTINGS]` (inside AsyncMutex) |

---

### 8. Domain Types

#### Primitive Aliases (`src/shared/types/common.ts`)

`ISODate`, `ISOTime`, `ISODateTime`, `Timezone`, `ID` — all `string`.

#### Union Types

| Name               | Values                                                | File                          |
| ------------------ | ----------------------------------------------------- | ----------------------------- |
| `TaskStatus`       | `"active" \| "discarded" \| "done"`                   | `src/shared/types/storage.ts` |
| `SyncStatus`       | `"inactive" \| "active" \| "syncing" \| "error"`      | `src/shared/types/storage.ts` |
| `LayoutType`       | `"list" \| "columns"`                                 | `src/shared/types/storage.ts` |
| `TaskMoveMode`     | `"list" \| "column"`                                  | `src/shared/types/storage.ts` |
| `TaskMovePosition` | `"before" \| "after"`                                 | `src/shared/types/storage.ts` |
| `DocType`          | `"task" \| "tag" \| "branch" \| "settings" \| "file"` | `src/main/types/database.ts`  |
| `SyncStrategy`     | `"pull" \| "push"`                                    | `src/main/types/sync.ts`      |

#### Task (Application)

```typescript
interface Task {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null
  branchId: ID
  scheduled: {date: ISODate; time: ISOTime; timezone: Timezone}
  estimatedTime: number
  spentTime: number
  content: string // Markdown
  minimized: boolean
  orderIndex: number
  status: TaskStatus
  tags: Tag[] // Full hydrated objects
  attachments: string[] // File IDs
}
```

#### TaskInternal (Storage boundary)

`ReplaceValue<Task, "tags", Tag["id"][]>` — identical to `Task` except `tags: ID[]`.

#### TaskDoc (PouchDB)

Extends `BaseDoc` (`_id`, `_rev`, `type`, `createdAt`, `updatedAt`, `deletedAt`). Additional:

- `status`, `orderIndex?`, `scheduled: {date, time, timezone}`, `estimatedTime`, `spentTime`, `content`, `branchId?`, `minimized?`, `tags: Tag["id"][]`, `attachments: string[]`

#### Tag

```typescript
type Tag = {id: ID; createdAt: ISODateTime; updatedAt: ISODateTime; deletedAt: ISODateTime | null; name: string; color: string}
```

#### Branch

```typescript
type Branch = {id: ID; createdAt: ISODateTime; updatedAt: ISODateTime; deletedAt: ISODateTime | null; name: string}
```

#### File

```typescript
type File = {id: ID; createdAt: ISODateTime; updatedAt: ISODateTime; deletedAt: ISODateTime | null; name: string; mimeType: string; size: number}
```

#### Day

```typescript
type Day = {id: ID; date: ISODate; tasks: Task[]; tags: Tag[]; countActive: number; countDone: number}
```

#### Settings

Full nested object with `version`, `themes`, `sidebar`, `sync`, `ai`, `branch`, `layout`, `window`, `updates`. Stored as JSON blob in `SettingsDoc.data`.

#### Snapshot Types (`src/main/types/sync.ts`)

```typescript
type SyncDoc = Omit<BaseDoc, "_rev"> & Record<string, any>
type SnapshotMeta = {updatedAt: ISODateTime; hash: string}
type SnapshotDocs = {tasks: TaskDoc[]; tags: TagDoc[]; branches: BranchDoc[]; files: FileDoc[]; settings: SettingsDoc | null}
type Snapshot = {docs: SnapshotDocs; meta: SnapshotMeta}
```

#### IStorageController (`src/main/types/storage.ts:9-67`)

Complete interface with 40+ methods covering: `init`, `getDays`, `getDay`, `getTaskList`, `getTask`, `updateTask`, `toggleTaskMinimized`, `moveTaskByOrder`, `moveTaskToBranch`, `createTask`, `deleteTask`, `getDeletedTasks`, `restoreTask`, `permanentlyDeleteTask`, `permanentlyDeleteAllDeletedTasks`, `searchTasks`, `getTagList`, `getTag`, `updateTag`, `createTag`, `deleteTag`, `addTaskTags`, `removeTaskTags`, `getBranchList`, `getBranch`, `createBranch`, `updateBranch`, `deleteBranch`, `setActiveBranch`, `addTaskAttachment`, `removeTaskAttachment`, `saveFile`, `getFilePath`, `deleteFile`, `getFiles`, `createFileResponse`, `cleanupOrphanFiles`, `loadSettings`, `saveSettings`, `setupStorageBroadcasts`, `activateSync`, `deactivateSync`, `forceSync`, `getSyncStatus`.

---

### 9. Build Configuration & Dependencies

#### PouchDB Dependencies (`package.json`)

| Package          | Type       | Version  |
| ---------------- | ---------- | -------- |
| `pouchdb`        | production | `^9.0.0` |
| `pouchdb-find`   | production | `^9.0.0` |
| `@types/pouchdb` | dev        | `^6.4.2` |

#### electron-vite Build

`externalizeDepsPlugin()` applied to main and preload targets — PouchDB NOT bundled, loaded from `node_modules` at runtime. Main → ESM, Preload → CJS.

#### electron-builder (`electron-builder.json`)

- `asar: true` — PouchDB's LevelDB native binaries must survive ASAR packaging
- `postinstall: "electron-builder install-app-deps"` — rebuilds native modules for Electron
- Target: `dmg` for `arm64` only
- `afterPack: "scripts/afterPack-mac.js"` — code signing with JIT/native module entitlements

#### Database Utility Scripts

| Script       | File                       | Purpose                                                 |
| ------------ | -------------------------- | ------------------------------------------------------- |
| `db:inspect` | `scripts/db/inspect-db.js` | View DB contents; supports `--export` and `--ids` modes |
| `db:clear`   | `scripts/db/clear-db.js`   | `db.destroy()` with interactive confirmation            |
| `db:seed`    | `scripts/db/seed.js`       | Generate 6 tags + 20 sample tasks                       |

**No migration system exists.** The `CLAUDE.md` references to `pnpm db:export` and `pnpm migrate` do not correspond to entries in the current `package.json`.

---

## Code References Map (As-Is)

### Database Layer

- **`src/main/storage/database.ts`** — PouchDB singleton init, index creation, close/destroy
  - Key deps: `pouchdb`, `pouchdb-find`, `fs-extra`

### Models Layer

- **`src/main/storage/models/_mappers.ts`** — `docIdMap`, `taskToDoc`/`docToTask`, `tagToDoc`/`docToTag`, `branchToDoc`/`docToBranch`, `settingsToDoc`/`docToSettings`, `fileToDoc`/`docToFile`
- **`src/main/storage/models/TaskModel.ts`** — CRUD, soft/permanent delete, retry-on-conflict, branch selector
  - Deps: `_mappers.ts`, `withRetryOnConflict`, `nanoid`
- **`src/main/storage/models/TagModel.ts`** — CRUD with 5-min TTL cache
  - Deps: `_mappers.ts`, `createCacheLoader`, `withRetryOnConflict`, `nanoid`
- **`src/main/storage/models/BranchModel.ts`** — CRUD with 5-min TTL cache, `ensureMainBranchDoc`
  - Deps: `_mappers.ts`, `createCacheLoader`, `withRetryOnConflict`, `nanoid`
- **`src/main/storage/models/FileModel.ts`** — CRUD with base64 `_attachments`
  - Deps: `_mappers.ts`, `withRetryOnConflict`, `nanoid`
- **`src/main/storage/models/SettingsModel.ts`** — load/save with TTL cache + AsyncMutex
  - Deps: `_mappers.ts`, `createCacheLoader`, `AsyncMutex`, `withRetryOnConflict`

### Services Layer

- **`src/main/storage/services/DaysService.ts`** — `getDays` (parallel fetch + hydration + grouping), `getDay`
  - Deps: `TaskModel`, `TagModel`, `groupTasksByDay`
- **`src/main/storage/services/TasksService.ts`** — CRUD with tag hydration, `moveTaskByOrder` (reorder logic)
  - Deps: `TaskModel`, `TagModel`
- **`src/main/storage/services/TagsService.ts`** — CRUD, cascade delete across all tasks
  - Deps: `TaskModel`, `TagModel`
- **`src/main/storage/services/FilesService.ts`** — save/delete/response/orphan cleanup
  - Deps: `FileModel`
- **`src/main/storage/services/SearchService.ts`** — in-memory search index management
  - Deps: `TaskModel`, `TagModel`, `BranchModel`, `TaskSearchIndex`

### Controller & IPC

- **`src/main/storage/StorageController.ts`** — Facade, init, 40+ delegating methods
  - Deps: all models, all services, `SyncEngine`, `database.ts`
- **`src/main/setup/ipc/storage.ts`** — 35 `ipcMain.handle` registrations
- **`src/main/setup/app/storage.ts`** — Event broadcasts to renderer
- **`src/main/setup/security/protocols.ts`** — `daily://` protocol handler

### Sync System

- **`src/main/storage/sync/SyncEngine.ts`** — Core sync logic, auto-scheduler, status management
  - Deps: `LocalStorageAdapter`, `RemoteStorageAdapter`, `createIntervalScheduler`, `withElapsedDelay`, merge utils
- **`src/main/storage/sync/adapters/LocalStorageAdapter.ts`** — PouchDB ↔ SnapshotDocs
  - Deps: PouchDB, `withRetryOnConflict`
- **`src/main/storage/sync/adapters/RemoteStorageAdapter.ts`** — `snapshot.json` read/write
  - Deps: `fs`, `path`
- **`src/main/utils/sync/merge/mergeRemoteIntoLocal.ts`** — Orchestrates all merges
- **`src/main/utils/sync/merge/mergeCollections.ts`** — LWW per-doc merge with GC
- **`src/main/utils/sync/merge/mergeSettings.ts`** — LWW local-wins-tie
- **`src/main/utils/sync/snapshot/buildSnapshot.ts`** — Hash computation, snapshot assembly
- **`src/main/utils/sync/snapshot/isValidSnapshot.ts`** — Validation
- **`src/main/utils/sync/snapshot/getDefaultSnapshot.ts`** — Empty snapshot factory

### Utilities

- **`src/main/utils/withRetryOnConflict.ts`** — 3-retry wrapper for PouchDB 409
- **`src/main/utils/AsyncMutex.ts`** — Queued async mutex
- **`src/main/utils/createCacheLoader.ts`** — TTL cache with dedup
- **`src/main/utils/createIntervalScheduler.ts`** — setInterval with overlap guard
- **`src/main/utils/tasks/groupTasksByDay.ts`** — Task → Day[] grouping

### Types

- **`src/shared/types/storage.ts`** — `Task`, `Tag`, `Branch`, `File`, `Day`, `Settings`, union types
- **`src/shared/types/common.ts`** — `ISODate`, `ISOTime`, `ISODateTime`, `Timezone`, `ID`
- **`src/shared/types/search.ts`** — `SearchMatch`, `TaskSearchResult`
- **`src/shared/types/sync.ts`** — `SyncStrategy`
- **`src/shared/types/utils.ts`** — `ReplaceKey`, `ReplaceValue`, `Replace`
- **`src/main/types/storage.ts`** — `TaskInternal`, `IStorageController`
- **`src/main/types/database.ts`** — `BaseDoc`, `TaskDoc`, `TagDoc`, `BranchDoc`, `SettingsDoc`, `FileDoc`, `AnyDoc`, `DocType`
- **`src/main/types/sync.ts`** — `Snapshot`, `SnapshotDocs`, `SnapshotMeta`, `SyncDoc`, `ILocalStorage`, `IRemoteStorage`
- **`src/main/types/search.ts`** — `SearchTask`, `SearchResult`, `SearchOptions`

### Build & Scripts

- **`package.json`** — PouchDB deps, npm scripts
- **`electron.vite.config.ts`** — `externalizeDepsPlugin`, path aliases
- **`electron-builder.json`** — ASAR, native module config, signing
- **`scripts/db/inspect-db.js`** — DB inspection/export
- **`scripts/db/clear-db.js`** — DB destruction
- **`scripts/db/seed.js`** — Sample data generation

---

## Architecture Documentation

### Storage Layer Pattern

```
Renderer (Vue) → Pinia Store → API → IPC → StorageController → Service → Model → Mapper → PouchDB
                                                    ↓
                                           SyncEngine (5-min cycle)
                                            ↓               ↓
                                     LocalAdapter      RemoteAdapter
                                     (PouchDB)         (snapshot.json)
                                            ↓
                                      Merge (LWW)
                                            ↓
                                      Broadcast → Renderer revalidation
```

### Key Conventions

1. **Soft delete**: All entities use `deletedAt: ISODateTime | null`. Permanent delete sets `deletedAt` to epoch (`1970-01-01T00:00:00.000Z`).
2. **Document ID prefixes**: All PouchDB `_id` values use `{type}:{id}` format.
3. **Tag storage**: Tasks store tag references as `string[]` (IDs); hydration to `Tag[]` happens at service layer.
4. **File storage**: Binary data stored as base64 in PouchDB `_attachments.data`.
5. **Conflict handling**: `withRetryOnConflict` (3 retries) for write operations; `AsyncMutex` only for settings.
6. **Caching**: TTL caches (5 minutes) on TagModel and BranchModel; no cache on TaskModel or FileModel.
7. **No migration system**: Indexes are idempotently created on startup.

---

## Interfaces and Contracts (As-Is)

### IStorageController — Complete Method Signatures

```typescript
interface IStorageController {
  rootDir: string
  init(): Promise<void>

  // Days
  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>

  // Tasks
  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  getTask(id: Task["id"]): Promise<Task | null>
  updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null>
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Task | null>
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Task | null>
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean>
  createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task | null>
  deleteTask(id: Task["id"]): Promise<boolean>
  getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  restoreTask(id: Task["id"]): Promise<Task | null>
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  permanentlyDeleteAllDeletedTasks(): Promise<number>

  // Search
  searchTasks(query: string): Promise<TaskSearchResult[]>

  // Tags
  getTagList(): Promise<Tag[]>
  getTag(id: Tag["id"]): Promise<Tag | null>
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null>
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null>
  deleteTag(id: Tag["id"]): Promise<boolean>
  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>

  // Branches
  getBranchList(): Promise<Branch[]>
  getBranch(id: Branch["id"]): Promise<Branch | null>
  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null>
  updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null>
  deleteBranch(id: Branch["id"]): Promise<boolean>
  setActiveBranch(id: Branch["id"]): Promise<void>

  // Files
  addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>
  removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>
  saveFile(filename: string, data: Buffer): Promise<File["id"]>
  getFilePath(id: File["id"]): string
  deleteFile(fileId: File["id"]): Promise<boolean>
  getFiles(fileIds: File["id"][]): Promise<File[]>
  createFileResponse(id: File["id"]): Promise<Response>
  cleanupOrphanFiles(): Promise<void>

  // Settings
  loadSettings(): Promise<Settings>
  saveSettings(newSettings: Partial<Settings>): Promise<void>

  // Sync
  setupStorageBroadcasts(callbacks: {onStatusChange: (status: SyncStatus, prev: SyncStatus) => void; onDataChange: () => void}): void
  activateSync(): Promise<void>
  deactivateSync(): Promise<void>
  forceSync(): Promise<void>
  getSyncStatus(): SyncStatus
}
```

### ILocalStorage

```typescript
interface ILocalStorage {
  loadAllDocs(): Promise<Snapshot["docs"]>
  upsertDocs(docs: SyncDoc[]): Promise<void>
  deleteDocs(ids: string[]): Promise<void>
}
```

### IRemoteStorage

```typescript
interface IRemoteStorage {
  loadSnapshot(): Promise<Snapshot | null>
  saveSnapshot(snapshot: Snapshot): Promise<void>
}
```

### IPC Channel → Controller Method Mapping

| Channel                        | Controller Method                    |
| ------------------------------ | ------------------------------------ |
| `settings:load`                | `loadSettings()`                     |
| `settings:save`                | `saveSettings(newSettings)`          |
| `days:get-many`                | `getDays(params)`                    |
| `days:get-one`                 | `getDay(date)`                       |
| `tasks:get-many`               | `getTaskList(params)`                |
| `tasks:get-one`                | `getTask(id)`                        |
| `tasks:update`                 | `updateTask(id, updates)`            |
| `tasks:toggle-minimized`       | `toggleTaskMinimized(id, minimized)` |
| `tasks:create`                 | `createTask(task)`                   |
| `tasks:move-by-order`          | `moveTaskByOrder(params)`            |
| `tasks:move-to-branch`         | `moveTaskToBranch(taskId, branchId)` |
| `tasks:delete`                 | `deleteTask(id)`                     |
| `tasks:get-deleted`            | `getDeletedTasks(params)`            |
| `tasks:restore`                | `restoreTask(id)`                    |
| `tasks:delete-permanently`     | `permanentlyDeleteTask(id)`          |
| `tasks:delete-all-permanently` | `permanentlyDeleteAllDeletedTasks()` |
| `tasks:add-tags`               | `addTaskTags(taskId, tags)`          |
| `tasks:remove-tags`            | `removeTaskTags(taskId, tags)`       |
| `branches:get-many`            | `getBranchList()`                    |
| `branches:get-one`             | `getBranch(id)`                      |
| `branches:create`              | `createBranch(branch)`               |
| `branches:update`              | `updateBranch(id, updates)`          |
| `branches:delete`              | `deleteBranch(id)`                   |
| `branches:set-active`          | `setActiveBranch(id)`                |
| `search:query`                 | `searchTasks(query)`                 |
| `tags:get-many`                | `getTagList()`                       |
| `tags:get-one`                 | `getTag(id)`                         |
| `tags:update`                  | `updateTag(id, updates)`             |
| `tags:create`                  | `createTag(tag)`                     |
| `tags:delete`                  | `deleteTag(id)`                      |
| `files:save`                   | `saveFile(filename, Buffer)`         |
| `files:delete`                 | `deleteFile(filename)`               |
| `files:get-path`               | `getFilePath(id)`                    |
| `storage-sync:activate`        | `activateSync()`                     |
| `storage-sync:deactivate`      | `deactivateSync()`                   |
| `storage-sync:sync`            | `forceSync()`                        |
| `storage-sync:get-status`      | `getSyncStatus()`                    |

---

## Related Research

- `docs/features/epic-sqlite-migration.md` — The migration epic this research supports
- `docs/features/epic-13-03-2026.md` — Related feature epic
- `CLAUDE.md` — Project-level documentation and conventions

---

## Context Budget

**Include** (essential for next phase):

- `src/main/storage/StorageController.ts` — facade and init flow
- `src/main/storage/models/*.ts` — all 5 models + mappers
- `src/main/storage/services/*.ts` — all 6 services
- `src/main/storage/sync/SyncEngine.ts` — sync core
- `src/main/storage/sync/adapters/*.ts` — local + remote adapters
- `src/main/types/storage.ts` — `IStorageController`, `TaskInternal`
- `src/main/types/database.ts` — all doc types
- `src/main/types/sync.ts` — sync types
- `src/shared/types/storage.ts` — domain types
- `src/main/config.ts` — paths and config
- `src/main/storage/database.ts` — PouchDB init
- `src/main/utils/sync/merge/*.ts` — merge logic
- `src/main/utils/withRetryOnConflict.ts`
- `src/main/utils/AsyncMutex.ts`
- `src/main/utils/createCacheLoader.ts`

**Optional** (load if design needs it):

- `src/main/setup/ipc/storage.ts` — IPC channel registrations
- `src/main/setup/security/protocols.ts` — protocol handler
- `src/main/setup/app/storage.ts` — event broadcasts
- `src/main/utils/createIntervalScheduler.ts`
- `src/main/utils/tasks/groupTasksByDay.ts`
- `src/main/storage/services/SearchService.ts` — search index (no DB changes)
- `package.json` — dependency versions
- `electron.vite.config.ts` — build config
- `electron-builder.json` — packaging config
- `scripts/db/*.js` — utility scripts

**Exclude** (not relevant to this task):

- `src/renderer/` — entire renderer process (IPC contract unchanged)
- `src/main/setup/ipc/window.ts` — window management
- `src/main/setup/ipc/menu.ts` — menu handlers
- `src/main/setup/app/updater.ts` — auto-updater
- `src/main/setup/app/tray.ts` — tray icon
- `public/` — static resources
