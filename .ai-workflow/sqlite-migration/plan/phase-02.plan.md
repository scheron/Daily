---
phase: 02
name: Models Layer
feature_slug: sqlite-migration
design: .ai-workflow/sqlite-migration/design/
status: pending
---

# Phase 02: Models Layer

## 1. Goal

Rewrite all 5 models (TaskModel, TagModel, BranchModel, FileModel, SettingsModel) to use SQLite prepared statements instead of PouchDB. Create inline row-to-domain mappers replacing `_mappers.ts`. Integrate disk-based file I/O (assets module) into FileModel. After this phase, models are fully functional SQLite-backed components but not yet wired into the app — the old PouchDB models still run.

## 2. Context

### Current State Analysis

All 5 models currently receive `PouchDB.Database` via constructor. They use:

- `_mappers.ts` for bidirectional doc-to-domain conversion with ID prefix logic (`task:`, `tag:`, `branch:`, `file:`, `settings:`)
- `withRetryOnConflict` for PouchDB 409 conflict handling (12 call sites total)
- `createCacheLoader` with 5-min TTL on TagModel and BranchModel
- `AsyncMutex` on SettingsModel for concurrent write protection
- Base64 `_attachments` in FileModel for binary file storage

**Key files being rewritten:**

- `src/main/storage/models/TaskModel.ts` (335 lines) — CRUD with PouchDB find, retry-on-conflict, `applyDiffToDoc`, `applyBranchSelector`
- `src/main/storage/models/TagModel.ts` (161 lines) — CRUD with TTL cache, retry-on-conflict
- `src/main/storage/models/BranchModel.ts` (223 lines) — CRUD with TTL cache, `ensureMainBranchDoc`
- `src/main/storage/models/FileModel.ts` (137 lines) — CRUD with base64 `_attachments`, `getFileWithAttachment`
- `src/main/storage/models/SettingsModel.ts` (145 lines) — load/save with AsyncMutex + cache + retry
- `src/main/storage/models/_mappers.ts` (263 lines) — `docIdMap`, all `*ToDoc`/`docTo*` functions

**Domain types (all imported from `@shared/types/` — unchanged in this phase):**

- `Task` (from `@shared/types/task`) — `id, status, content, tags: Tag[], attachments: string[], scheduled: {date, time, timezone}, minimized: boolean, orderIndex: number, estimatedTime, spentTime, branchId, createdAt, updatedAt, deletedAt`
- `TaskInternal` (from `@shared/types/task`) — same as Task but `tags: ID[]` (string array of tag IDs). Used as input type for `createTask`/`updateTask` parameters.
- `Tag` (from `@shared/types/tag`) — `id, name, color, createdAt, updatedAt, deletedAt`
- `Branch` (from `@shared/types/branch`) — `id, name, createdAt, updatedAt, deletedAt`
- `File` (from `@shared/types/file`) — `id, name, mimeType, size, createdAt, updatedAt, deletedAt`
- `Settings` (from `@shared/types/settings`) — nested JSON blob with `version, themes, sidebar, sync, ai, branch, layout, window, updates`
- `Day` (from `@shared/types/day`) — `id, date, tasks: Task[], tags: Tag[], countActive, countDone`
- `ID` (from `@shared/types/common`) — `string` alias
- `ISODate`, `ISODateTime` (from `@shared/types/common`) — string aliases

### Architecture Context

**ADR-2:** Join tables for many-to-many (task_tags, task_attachments). SQL JOINs with `json_group_array` for tag hydration.

**ADR-3:** Eliminate TTL caches and `withRetryOnConflict`. SQLite has no revision system, no 409 conflicts.

**ADR-4:** Disk-based file storage. Binary files at `assets/{fileId}.{ext}`, metadata in `files` table.

**ADR-5:** Tag hydration via SQL subqueries using `json_group_array`/`json_object`.

**ADR-9:** Preserve `IStorageController` interface exactly. Models must return same domain types.

### Similar Implementation

- `src/main/storage/models/TaskModel.ts:18-53` — Current `getTaskList` pattern to replicate with SQL
- `src/main/storage/models/_mappers.ts:39-91` — Current `taskToDoc`/`docToTask` field mapping (scheduled flatten, orderIndex fallback, branchId default)
- `src/main/storage/models/BranchModel.ts:188-222` — `ensureMainBranchDoc` pattern → `INSERT OR IGNORE`

### Data Flow Steps (from design/02-data-flow.md)

getDays flow (section 3):

```
5. TaskModel executes prepared SQL:
   SELECT t.*, tags_json, attachments_json FROM tasks t
   WHERE branch_id=? AND scheduled_date BETWEEN ? AND ? AND deleted_at IS NULL
   ORDER BY scheduled_date, order_index
6. TaskModel maps rows → Task[] (tags already hydrated, attachments already resolved)
```

createTask flow (section 4):

```
6. TaskModel runs transaction:
   BEGIN
   INSERT INTO tasks (id, status, content, ...) VALUES (nanoid(), ...)
   INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?) × N tags
   INSERT INTO task_attachments (task_id, file_id) VALUES (?, ?) × N attachments
   COMMIT
7. TaskModel fetches created task with hydrated tags (getTask(id))
```

saveFile flow (section 6):

```
4. FilesService:
   a. Generate fileId = nanoid()
   b. Extract ext from filename
   c. saveAsset(fileId, ext, data) → fs.writeFile(assets/{fileId}.{ext}, data)
   d. fileModel.createFile(fileId, name, mimeType, data.length) → INSERT INTO files
```

### Key Discoveries

- `TaskModel` currently returns `TaskInternal` (tags as `ID[]`), services hydrate to `Task` (tags as `Tag[]`). With SQL JOINs, TaskModel can return fully hydrated `Task` directly, eliminating the need for `TaskInternal` at the model boundary.
- `_mappers.ts:43-44` — `orderIndex` fallback to `Date.parse(createdAt)` must be preserved in row mapper
- `_mappers.ts:58` — `branchId` defaults to `MAIN_BRANCH_ID` (imported from `@shared/constants/storage`) if missing in PouchDB doc; in SQLite this is `DEFAULT 'main'`. The constant `MAIN_BRANCH_ID` is exported from `src/shared/constants/storage.ts` — reuse this import in the new BranchModel.
- `SettingsModel` uses `AsyncMutex` + `withRetryOnConflict` — both unnecessary with synchronous SQLite writes
- `FileModel.createFile` currently accepts `data: Buffer` and stores base64 in `_attachments` — new model only stores metadata, binary goes to disk via assets
- `BranchModel.ensureMainBranchDoc` does get→check→restore/create — replaces with `INSERT OR IGNORE` + conditional restore
- `TagModel.deleteTag` only soft-deletes the tag itself — removing task_tags associations is currently done in `TagsService`. In the new model, `deleteTag` should handle both in a transaction (per design/04-contracts.md).
- `permanentlyDeleteTask` sets `deletedAt` to epoch (`1970-01-01T00:00:00.000Z`) as a sentinel — must preserve this convention
- `getDeletedTasks` filters out epoch-sentinel permanently deleted tasks — must preserve filter: `deleted_at >= '2000-01-01'`

### Desired End State

- All 5 model files rewritten to accept `Database` (better-sqlite3) instead of `PouchDB.Database`
- `_mappers.ts` replaced with `_rowMappers.ts` containing `rowToTask`, `rowToTag`, `rowToBranch`, `rowToFile`, `rowToSettings`
- TaskModel returns fully hydrated `Task` objects (tags as `Tag[]`) via SQL subqueries
- FileModel includes assets methods: `initAssets`, `saveAsset`, `readAssetBuffer`, `deleteAsset`, `listAssets`, `cleanupOrphanAssets`, `getAssetPath`
- All models compile and export correct types
- No TTL caches, no `withRetryOnConflict`, no `AsyncMutex` in any model
- Models are self-contained — can be tested independently with a test SQLite DB

## 3. Files to Create or Modify

| File                                       | Action  | Why                                                              |
| ------------------------------------------ | ------- | ---------------------------------------------------------------- |
| `src/main/storage/models/TaskModel.ts`     | rewrite | PouchDB → SQL prepared statements with tag/attachment subqueries |
| `src/main/storage/models/TagModel.ts`      | rewrite | Remove TTL cache, SQL queries, cascade delete via transaction    |
| `src/main/storage/models/BranchModel.ts`   | rewrite | Remove TTL cache, `INSERT OR IGNORE` for ensureMain              |
| `src/main/storage/models/FileModel.ts`     | rewrite | Metadata in SQL, binary via assets on disk                       |
| `src/main/storage/models/SettingsModel.ts` | rewrite | Remove AsyncMutex/cache, `INSERT OR REPLACE`                     |
| `src/main/storage/models/_rowMappers.ts`   | create  | Row-to-domain mapping functions (replaces `_mappers.ts`)         |

## 4. Implementation Approach

1. **Create row mappers (`_rowMappers.ts`)**
   - What to do: Create `src/main/storage/models/_rowMappers.ts` with:
     - `rowToTask(row)`: maps SQL row (snake_case + `tags_json` + `attachments_json`) → `Task`. Parse `tags_json` via `JSON.parse` → if result is `[null]` or null, return `[]`; otherwise filter out null entries and return `Tag[]`. Parse `attachments_json` → same null handling → `string[]`. Convert `minimized: 0|1` → `boolean`. Map `scheduled_date/time/timezone` → `scheduled: {date, time, timezone}`. Map `order_index` → `orderIndex` with fallback to `Date.parse(created_at)`. Default `branch_id` to `'main'`.
     - `rowToTag(row)`: maps SQL row → `Tag`. Simple snake_case → camelCase.
     - `rowToBranch(row)`: maps SQL row → `Branch`. Simple snake_case → camelCase.
     - `rowToFile(row)`: maps SQL row → `File`. Map `mime_type` → `mimeType`.
     - `rowToSettings(row)`: maps SQL row → `Settings`. `JSON.parse(row.data)` with deep-merge against defaults using `deepMerge` from `@shared/utils/common/deepMerge` (already used by current SettingsModel at `src/main/storage/models/SettingsModel.ts:4`).
   - Acceptance check: All mappers compile. Handle null/empty JSON arrays correctly.

2. **Rewrite TaskModel**
   - What to do: Rewrite `src/main/storage/models/TaskModel.ts` to accept `Database` (better-sqlite3). Use prepared statements for all queries. Key changes:
     - Constructor: store `db`. Import `nanoid` from `"nanoid"` and `fs` from `"fs-extra"` (for FileModel).
     - `getTaskList(params?)`: Build SQL dynamically based on params (from/to/branchId/limit/includeDeleted). Use subqueries for `tags_json` and `attachments_json`. Return `Task[]` (fully hydrated).
     - `getTask(id)`: Same query pattern, `WHERE t.id = ?`. Return `Task | null`.
     - `createTask(task)`: Transaction — INSERT into `tasks`, then INSERT into `task_tags` and `task_attachments` for associations. Generate `nanoid()` ID (import from `"nanoid"`). Return hydrated `Task` via `getTask`.
     - `updateTask(id, updates)`: Transaction — Build dynamic UPDATE by collecting `key = ?` pairs for each field present in `updates` (e.g., `const setClauses = []; const values = []; if (updates.content !== undefined) { setClauses.push("content = ?"); values.push(updates.content); }` etc.), then `db.prepare(\`UPDATE tasks SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?\`).run(...values, now, id)`. If `tags`provided: DELETE existing`task_tags`for this task, INSERT new ones. If`attachments`provided: same for`task_attachments`. Return hydrated `Task`.
     - `deleteTask(id)`: UPDATE `tasks SET deleted_at = now() WHERE id = ?`. Return boolean.
     - `getDeletedTasks(params?)`: SELECT where `deleted_at IS NOT NULL AND deleted_at >= '2000-01-01'` (exclude epoch sentinel).
     - `restoreTask(id)`: UPDATE `SET deleted_at = NULL`. Return hydrated `Task`.
     - `permanentlyDeleteTask(id)`: UPDATE `SET deleted_at = '1970-01-01T00:00:00.000Z'` (epoch sentinel). Return boolean.
     - `permanentlyDeleteAllDeletedTasks(branchId?)`: UPDATE all soft-deleted to epoch. Return count.
     - `addTaskTags(taskId, tagIds)`: INSERT OR IGNORE into `task_tags`. Return hydrated `Task`.
     - `removeTaskTags(taskId, tagIds)`: DELETE FROM `task_tags`. Return hydrated `Task`.
     - `addTaskAttachment(taskId, fileId)`: INSERT OR IGNORE into `task_attachments`. Return hydrated `Task`.
     - `removeTaskAttachment(taskId, fileId)`: DELETE FROM `task_attachments`. Return hydrated `Task`.
     - The SQL subquery for tags_json:
       ```sql
       (SELECT json_group_array(json_object(
         'id', tg.id, 'name', tg.name, 'color', tg.color,
         'createdAt', tg.created_at, 'updatedAt', tg.updated_at, 'deletedAt', tg.deleted_at
       )) FROM task_tags tt JOIN tags tg ON tt.tag_id = tg.id AND tg.deleted_at IS NULL
        WHERE tt.task_id = t.id) AS tags_json
       ```
     - The SQL subquery for attachments_json:
       ```sql
       (SELECT json_group_array(f.id)
        FROM task_attachments ta JOIN files f ON ta.file_id = f.id
        WHERE ta.task_id = t.id) AS attachments_json
       ```
   - Acceptance check: All methods compile. SQL syntax valid. Returns `Task` (not `TaskInternal`). Transaction wraps multi-table operations.

3. **Rewrite TagModel**
   - What to do: Rewrite to accept `Database`. No TTL cache. Key changes:
     - `getTagList(params?)`: SELECT with optional `WHERE deleted_at IS NULL`. Return `Tag[]`.
     - `getTag(id)`: SELECT by id. Return `Tag | null`.
     - `createTag(tag)`: INSERT with `nanoid()` ID. Return `Tag`.
     - `updateTag(id, updates)`: UPDATE SET only `color` and/or `name` fields. Return `Tag`.
     - `deleteTag(id)`: Transaction — `DELETE FROM task_tags WHERE tag_id = ?` then `UPDATE tags SET deleted_at = now()`. Return boolean.
     - Keep `invalidateCache()` as a no-op for backward compatibility with `StorageController.onDataChanged` callback.
   - Acceptance check: `deleteTag` handles cascade in transaction. No `withRetryOnConflict`. No `createCacheLoader`.

4. **Rewrite BranchModel**
   - What to do: Rewrite to accept `Database`. No TTL cache. Key changes:
     - `ensureMainBranch()`: `INSERT OR IGNORE INTO branches (id, name, created_at, updated_at) VALUES ('main', 'Main', now, now)`. Then check if soft-deleted and restore: `UPDATE branches SET deleted_at = NULL WHERE id = 'main' AND deleted_at IS NOT NULL`.
     - `getBranchList(params?)`: SELECT with optional deleted filter. Return `Branch[]`.
     - `getBranch(id, params?)`: SELECT by id. Return `Branch | null`.
     - `createBranch(branch)`: INSERT with `nanoid()` ID. Return `Branch`.
     - `updateBranch(id, updates)`: Guard against `MAIN_BRANCH_ID`. UPDATE SET `name`. Return `Branch`.
     - `deleteBranch(id)`: Guard against `MAIN_BRANCH_ID`. Soft-delete. Return boolean.
     - Keep `invalidateCache()` as no-op.
   - Acceptance check: `ensureMainBranch` uses `INSERT OR IGNORE`. Guards preserved.

5. **Rewrite FileModel**
   - What to do: Rewrite to accept `Database`. Add disk-based assets methods. Key changes:
     - Constructor: store `db` and `assetsDir` path
     - `initAssets()`: `fs.ensureDirSync(this.assetsDir)` — uses `assetsDir` from constructor, no parameter needed
     - `saveAsset(fileId, ext, data)`: `fs.writeFile(path.join(assetsDir, fileId + '.' + ext), data)`
     - `readAssetBuffer(fileId, ext)`: `fs.readFile(path.join(assetsDir, fileId + '.' + ext))`
     - `deleteAsset(fileId, ext)`: `fs.unlink` with no-op on ENOENT
     - `listAssets()`: `fs.readdir(assetsDir)`
     - `cleanupOrphanAssets(validFileIds)`: list assets, delete those not in set, return count
     - `getAssetPath(fileId, ext)`: return absolute path
     - `getFileList(params?)`: SELECT metadata. Return `File[]`.
     - `getFiles(ids)`: SELECT WHERE id IN (...). Return `File[]`.
     - `createFile(id, name, mimeType, size)`: INSERT metadata. Binary NOT stored in DB. Return `File`.
     - `getFile(id)`: SELECT by id. Return `File | null`.
     - `deleteFile(id)`: Soft-delete metadata. Return boolean.
     - `getReferencedFileIds()`: `SELECT DISTINCT file_id FROM task_attachments` → `Set<ID>`.
   - Acceptance check: No base64 in DB. Assets methods handle filesystem I/O. `createFile` accepts pre-generated `id` (not `data: Buffer`).

6. **Rewrite SettingsModel**
   - What to do: Rewrite to accept `Database`. No AsyncMutex, no TTL cache, no retry. Key changes:
     - `getDefaultSettings()`: same as current (lines 29-73 of current file)
     - `loadSettings()`: `SELECT data FROM settings WHERE id = 'default'`. If not found, return defaults. `JSON.parse(data)` with deep-merge against defaults using `deepMerge` from `@shared/utils/common/deepMerge`.
     - `saveSettings(partial)`: Load current, deep-merge with partial using `deepMerge`, generate new version (`nanoid()`). `INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)` where data is `JSON.stringify(merged)`.
     - Keep `invalidateCache()` as no-op.
   - Acceptance check: Settings stored as JSON blob in `data` column. No AsyncMutex. Deep-merge preserves all nested fields.

## Scope Boundary

This phase does NOT:

- Wire models into services or StorageController (Phase 3)
- Delete old PouchDB models or `_mappers.ts` (Phase 7)
- Create or modify any service files
- Change app behavior — old PouchDB models still run the app

## 5. Embedded Contracts

### TaskModel Contract (from design/04-contracts.md section 2.4.1)

```typescript
import type Database from "better-sqlite3"

type TaskRow = {
  id: string
  status: string
  content: string
  minimized: number // 0 | 1
  order_index: number
  scheduled_date: string
  scheduled_time: string
  scheduled_timezone: string
  estimated_time: number
  spent_time: number
  branch_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  tags_json: string | null
  attachments_json: string | null
}

export class TaskModel {
  constructor(db: Database.Database)

  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: ID; includeDeleted?: boolean}): Task[]

  getTask(id: ID): Task | null
  createTask(task: Omit<TaskInternal, "id" | "createdAt" | "updatedAt">): Task | null
  updateTask(id: ID, updates: Partial<TaskInternal>): Task | null
  deleteTask(id: ID): boolean
  getDeletedTasks(params?: {limit?: number; branchId?: ID}): Task[]
  restoreTask(id: ID): Task | null
  permanentlyDeleteTask(id: ID): boolean
  permanentlyDeleteAllDeletedTasks(branchId?: ID): number
  addTaskTags(taskId: ID, tagIds: ID[]): Task | null
  removeTaskTags(taskId: ID, tagIds: ID[]): Task | null
  addTaskAttachment(taskId: ID, fileId: ID): Task | null
  removeTaskAttachment(taskId: ID, fileId: ID): Task | null
}
```

### TagModel Contract (from design/04-contracts.md section 2.4.2)

```typescript
export class TagModel {
  constructor(db: Database.Database)

  invalidateCache(): void // no-op for backward compat
  getTagList(params?: {includeDeleted?: boolean}): Tag[]
  getTag(id: ID): Tag | null
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Tag | null
  updateTag(id: ID, updates: Partial<Pick<Tag, "color" | "name">>): Tag | null
  /** Soft-delete tag + DELETE FROM task_tags in transaction. */
  deleteTag(id: ID): boolean
}
```

### BranchModel Contract (from design/04-contracts.md section 2.4.3)

```typescript
export class BranchModel {
  constructor(db: Database.Database)

  invalidateCache(): void // no-op for backward compat
  ensureMainBranch(): void
  getBranchList(params?: {includeDeleted?: boolean}): Branch[]
  getBranch(id: ID, params?: {includeDeleted?: boolean}): Branch | null
  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Branch | null
  updateBranch(id: ID, updates: Pick<Branch, "name">): Branch | null
  deleteBranch(id: ID): boolean
}
```

### FileModel Contract (from design/04-contracts.md sections 2.3 + 2.4.4)

```typescript
export class FileModel {
  constructor(db: Database.Database, assetsDir: string)

  // Assets (disk I/O)
  initAssets(): void
  saveAsset(fileId: string, ext: string, data: Buffer): Promise<void>
  readAssetBuffer(fileId: string, ext: string): Promise<Buffer>
  deleteAsset(fileId: string, ext: string): Promise<void>
  listAssets(): Promise<string[]>
  cleanupOrphanAssets(validFileIds: Set<string>): Promise<number>
  getAssetPath(fileId: string, ext: string): string

  // Metadata (SQL)
  getFileList(params?: {includeDeleted?: boolean}): File[]
  getFiles(ids: ID[]): File[]
  createFile(id: ID, name: string, mimeType: string, size: number): File | null
  getFile(id: ID): File | null
  deleteFile(id: ID): boolean
  getReferencedFileIds(): Set<ID>
}
```

### SettingsModel Contract (from design/04-contracts.md section 2.4.5)

```typescript
export class SettingsModel {
  constructor(db: Database.Database)

  invalidateCache(): void // no-op for backward compat
  loadSettings(): Settings
  saveSettings(newSettings: Partial<Settings>): void
}
```

### SQL Subqueries for Tag Hydration (from design/04-contracts.md, epic getDays query)

```sql
-- Tags as JSON array (used in TaskModel queries)
(SELECT json_group_array(json_object(
  'id', tg.id, 'name', tg.name, 'color', tg.color,
  'createdAt', tg.created_at, 'updatedAt', tg.updated_at, 'deletedAt', tg.deleted_at
)) FROM task_tags tt JOIN tags tg ON tt.tag_id = tg.id AND tg.deleted_at IS NULL
 WHERE tt.task_id = t.id) AS tags_json

-- Attachments as JSON array
(SELECT json_group_array(f.id)
 FROM task_attachments ta JOIN files f ON ta.file_id = f.id
 WHERE ta.task_id = t.id) AS attachments_json
```

## 6. Validation Gates

### Automated

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck:main` passes
- [ ] All 5 model files compile with `Database` (better-sqlite3) constructor
- [ ] `_rowMappers.ts` compiles and exports all mapper functions
- [ ] No imports of `withRetryOnConflict`, `createCacheLoader`, or `PouchDB` in new model files
- [ ] TaskModel methods return `Task` (not `TaskInternal`) — tags as `Tag[]`
- [ ] FileModel constructor accepts `assetsDir` parameter
- [ ] TagModel.deleteTag uses transaction (DELETE task_tags + UPDATE tags)

### Manual

- [ ] In `pnpm dev` console, manually instantiate models with the SQLite DB and verify basic operations work (create task, get task with tags, save/read file asset)
- [ ] TaskModel.getTask returns Tag[] objects in tags field (not strings)
- [ ] FileModel saveAsset + readAssetBuffer round-trips correctly (binary data preserved)
- [ ] SettingsModel loadSettings after saveSettings preserves all nested fields

## 7. Implementation Note

After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.
