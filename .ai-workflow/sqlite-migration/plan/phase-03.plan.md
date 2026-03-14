---
phase: 03
name: Services + Controller Wiring
feature_slug: sqlite-migration
design: .ai-workflow/sqlite-migration/design/
status: pending
---

# Phase 03: Services + Controller Wiring

## 1. Goal

Simplify the services layer to work with the new SQLite-backed models (which return fully hydrated `Task` objects), update `StorageController.init()` to initialize SQLite instead of PouchDB, and wire everything together so the app runs fully on SQLite. After this phase, the app works end-to-end with SQLite for new installs (no data migration yet).

## 2. Context

### Current State Analysis

Services currently perform tag hydration in every read path: parallel fetch tasks + all tags → build `Map<id, Tag>` → map each task's `tags: string[]` to `Tag[]`. This pattern appears in:

- `DaysService.getDays` (lines 22-33) — parallel fetch + hydrate + groupByDay
- `TasksService.getTaskList` (lines 17-26) — parallel fetch + hydrate
- `TasksService.getTask` (lines 28-36) — parallel fetch + hydrate
- `TasksService.updateTask` (lines 38-52) — convert Tag[] → ID[], hydrate result
- `TasksService.createTask` (lines 54-67) — convert Tag[] → ID[], hydrate result
- `TasksService.getDeletedTasks` (lines 147-156) — hydrate
- `TasksService.restoreTask` (lines 158-167) — hydrate
- `TagsService.deleteTag` (lines 30-59) — loads ALL tasks, updates each one that references the tag

With the new TaskModel returning fully hydrated `Task` objects (tags as `Tag[]` via SQL JOINs), all hydration code in services becomes unnecessary. `TagsService.deleteTag` no longer needs to load all tasks — the new TagModel handles cascade via `DELETE FROM task_tags` in a transaction.

**StorageController.init()** (lines 55-97):

1. `fs.ensureDir(rootDir)`
2. `getDB(fsPaths.dbPath())` → PouchDB
3. Instantiate 5 models with PouchDB
4. Instantiate 7 services
5. Create sync adapters + SyncEngine
6. Load settings, restore auto-sync
7. Initialize search index

**FilesService.createFileResponse** (lines 46-94): Currently decodes base64 from PouchDB `_attachments`. Must change to read from disk via FileModel assets.

**FilesService.cleanupOrphanFiles** (lines 96-121): Currently accepts `Task[]` and extracts file IDs from content + attachments. With SQLite, can use `FileModel.getReferencedFileIds()` for attachment references, still need content scan for inline images.

### Architecture Context

**ADR-5:** Tag hydration moves from services into SQL JOINs in TaskModel. Services become thin pass-throughs for read operations.

**ADR-9:** `IStorageController` interface (40+ methods) preserved exactly. All changes internal.

**ADR-10:** Retain `groupTasksByDay` as post-SQL utility. SQL returns sorted, hydrated rows. Utility groups into `Day[]` in O(N).

### Similar Implementation

- `src/main/storage/StorageController.ts:55-97` — Current init flow to modify
- `src/main/storage/services/DaysService.ts:17-35` — Current getDays with hydration to simplify
- `src/main/storage/services/TasksService.ts:54-67` — createTask converts Tag[]→ID[], hydrates result
- `src/main/storage/services/FilesService.ts:46-94` — createFileResponse with base64 decode to rewrite

### Data Flow Steps (from design/02-data-flow.md, Application Init)

```
1. Electron main process starts
2. StorageController.init() called
3. fs.ensureDir(appDataRoot)
4. fs.ensureDir(assetsDir)
5. initDatabase(sqlitePath)
7. initAssets(assetsDir)
8. Instantiate 5 models (all receive db: Database)
9. branchModel.ensureMainBranch()
10. Instantiate 7 services
11. Instantiate SyncEngine with LocalStorageAdapter(db) + RemoteStorageAdapter
12. loadSettings → restore auto-sync if enabled
13. searchService.initializeIndex()
14. Init complete → renderer can call IPC
```

### Key Discoveries

- `TasksService.addTaskTags` (lines 187-201) and `removeTaskTags` (lines 203-217) currently do get→merge→update pattern. With new TaskModel having dedicated `addTaskTags`/`removeTaskTags` methods, these become direct delegations.
- `TasksService.addTaskAttachment` / `removeTaskAttachment` (lines 219-246) — same pattern, direct delegation to TaskModel.
- `TasksService.moveTaskByOrder` (lines 69-130) — complex reorder logic using `getOrderIndexBetween` and `normalizeTaskOrderIndexes`. This stays mostly the same but now calls synchronous model methods. Since TaskModel returns `Task` (not `TaskInternal`), no hydration step needed.
- `TasksService.permanentlyDeleteAllDeletedTasks` (lines 173-185) — currently loops through deleted tasks and permanently deletes each. New TaskModel has batch method returning count.
- `DaysService` still needs `TagModel` dependency for `getTagList()` call in `groupTasksByDay` — actually, no: tasks already have hydrated tags, and `groupTasksByDay` accumulates tags from tasks. So DaysService no longer needs TagModel at all.
- `StorageController.cleanupOrphanFiles` (line 394-397) currently passes all tasks to FilesService. New approach: FilesService queries referenced file IDs directly from SQL.

### Desired End State

- DaysService simplified: no tag hydration, single call to `taskModel.getTaskList()` + `groupTasksByDay`
- TasksService simplified: no tag hydration in any method, direct delegation for addTaskTags/removeTaskTags/addTaskAttachment/removeTaskAttachment
- TagsService simplified: `deleteTag` delegates directly to `tagModel.deleteTag()` (which handles cascade internally)
- FilesService rewritten: disk-based file response, SQL-based orphan cleanup
- StorageController.init() uses `initDatabase()` + SQLite models instead of `getDB()` + PouchDB
- App fully functional on SQLite for new installs
- `DaysService` no longer depends on `TagModel`
- `TagsService` no longer depends on `TaskModel`

## 3. Files to Create or Modify

| File                                        | Action   | Why                                                              |
| ------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `src/main/storage/services/DaysService.ts`  | simplify | Remove tag hydration, remove TagModel dependency                 |
| `src/main/storage/services/TasksService.ts` | simplify | Remove tag hydration, delegate tag/attachment ops to TaskModel   |
| `src/main/storage/services/TagsService.ts`  | simplify | Remove task loading cascade, delegate to TagModel                |
| `src/main/storage/services/FilesService.ts` | rewrite  | Disk-based file response, SQL orphan cleanup                     |
| `src/main/storage/StorageController.ts`     | modify   | Init SQLite, wire new models/services, update cleanupOrphanFiles |

## 4. Implementation Approach

1. **Simplify DaysService**
   - What to do: Remove TagModel from constructor. `getDays` becomes: call `taskModel.getTaskList({from, to, branchId})` → pass result to `groupTasksByDay`. Tasks are already hydrated with tags by the model. `getDay` delegates to `getDays`.
   - Acceptance check: No `tagModel` import or usage. `getDays` makes one model call + one grouping call.

2. **Simplify TasksService**
   - What to do:
     - Remove TagModel from constructor
     - `getTaskList`: direct delegation to `taskModel.getTaskList()` — no hydration
     - `getTask`: direct delegation — no hydration
     - `updateTask`: convert `updates.tags: Tag[]` → `string[]` if present, delegate to `taskModel.updateTask()` — result already hydrated
     - `createTask`: convert `task.tags: Tag[]` → `string[]`, delegate to `taskModel.createTask()` — result already hydrated
     - `moveTaskByOrder`: keep reorder logic but remove hydration calls (model returns hydrated Task)
     - `deleteTask`, `permanentlyDeleteTask`: direct delegation
     - `getDeletedTasks`, `restoreTask`: direct delegation — no hydration
     - `permanentlyDeleteAllDeletedTasks`: use `taskModel.permanentlyDeleteAllDeletedTasks(branchId)` — returns count
     - `addTaskTags`, `removeTaskTags`: delegate directly to `taskModel.addTaskTags/removeTaskTags`
     - `addTaskAttachment`, `removeTaskAttachment`: delegate directly to `taskModel.addTaskAttachment/removeTaskAttachment`
   - Acceptance check: No `tagModel` import. No `Map<id, Tag>` construction. No `sortTags` import.

3. **Simplify TagsService**
   - What to do: Remove TaskModel from constructor. `deleteTag` becomes: `return tagModel.deleteTag(id)` — the model handles `DELETE FROM task_tags` + soft-delete in a transaction internally.
   - Acceptance check: No `taskModel` import. `deleteTag` is one line.

4. **Rewrite FilesService**
   - What to do:
     - `saveFile(filename, data)`: generate `fileId = nanoid()`, extract extension, resolve MIME, call `fileModel.saveAsset(fileId, ext, data)`, then `fileModel.createFile(fileId, filename, mimeType, data.length)`. Return `fileId`.
     - `createFileResponse(id)`: call `fileModel.getFile(id)` → check deletedAt → determine ext from `file.name` → `fileModel.readAssetBuffer(id, ext)` → return `new Response(buffer, {Content-Type, Content-Length})`. Return 404 if not found or deleted.
     - `cleanupOrphanFiles()`: no longer accepts `tasks` parameter. Uses `fileModel.getReferencedFileIds()` to get IDs referenced in `task_attachments`. Separately load all tasks via `taskModel.getTaskList()` and call `extractFileIds(task.content)` (from `@/utils/files/extractFileIds` — existing utility at `src/main/utils/files/extractFileIds.ts`) to find inline image references. Combine both sets. Delete unreferenced files via `fileModel.deleteFile()` + `fileModel.deleteAsset()`. Also call `fileModel.cleanupOrphanAssets(validFileIds)` for disk cleanup.
     - `getFilePath`, `deleteFile`, `getFiles`: thin delegations (unchanged logic)
     - Note: FilesService constructor now takes `(fileModel: FileModel, taskModel: TaskModel)` — needs TaskModel for content scanning in cleanupOrphanFiles.
   - Acceptance check: No `getFileWithAttachment` calls. No base64 decode. File read from disk. `cleanupOrphanFiles()` takes no parameters.

5. **Update StorageController.init()**
   - What to do:
     - Replace `getDB(fsPaths.dbPath())` with `initDatabase(fsPaths.dbPath())` — import from `@/storage/database/instance`
     - Remove the `import { getDB } from "@/storage/database"` line (the PouchDB singleton). The file `database.ts` itself is not deleted until Phase 7, but StorageController no longer imports it.
     - Create `assetsDir` via `fs.ensureDir(fsPaths.assetsDir())`
     - Instantiate models with `db` (better-sqlite3 Database) instead of PouchDB:
       - `new FileModel(db, fsPaths.assetsDir())` — with assets dir
       - Other models: `new TaskModel(db)`, etc.
     - Call `branchModel.ensureMainBranch()` after model instantiation
     - Update service instantiation:
       - `DaysService(taskModel)` — no tagModel
       - `TasksService(taskModel)` — no tagModel
       - `TagsService(tagModel)` — no taskModel
       - `FilesService(fileModel, taskModel)` — adds taskModel for content scanning in cleanupOrphanFiles
     - Update `onDataChanged` callback: `tagModel.invalidateCache()` and `branchModel.invalidateCache()` are no-ops now but keep for safety
     - `cleanupOrphanFiles()` internal call: no longer passes tasks, just `this.filesService.cleanupOrphanFiles()`
     - **SyncEngine handling**: Keep the existing SyncEngine instantiation code. The SyncEngine and its PouchDB-based adapters (`LocalStorageAdapter`, `RemoteStorageAdapter`) still reference PouchDB, but they are NOT imported from `database.ts` — they have their own PouchDB imports. SyncEngine will temporarily not function (sync operations will error gracefully and set status to "error"). Phase 5 rewrites the adapters. Do NOT remove SyncEngine instantiation or its adapter imports.
   - Acceptance check: App starts, creates SQLite DB, models initialized. `StorageController` no longer imports `getDB` from `database.ts`. SyncEngine is still instantiated but sync operations gracefully error.

6. **Update StorageController method signatures**
   - What to do: No changes needed to method signatures. Async functions can return synchronous values in TypeScript — an `async` function that calls a synchronous model method simply resolves the promise immediately. All existing `await` keywords on model calls can remain (awaiting a non-promise value is a no-op) or be removed for clarity. The public interface is unchanged.
   - Acceptance check: `pnpm typecheck:main` passes. All `IStorageController` methods still match the interface (class is at `src/main/storage/StorageController.ts` — no separate interface file).

## 5. Embedded Contracts

### DaysService Contract (from design/04-contracts.md section 2.7)

```typescript
export class DaysService {
  constructor(taskModel: TaskModel)

  /**
   * Delegates to TaskModel.getTaskList (tags hydrated via SQL),
   * then groups into Day[] via single O(N) pass using groupTasksByDay utility.
   */
  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: ID}): Day[]

  getDay(date: ISODate, params?: {branchId?: ID}): Day | null
}
```

### TasksService Contract

```typescript
import type {Task, TaskInternal} from "@shared/types/task"

export class TasksService {
  constructor(taskModel: TaskModel)

  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: ID; includeDeleted?: boolean}): Task[]
  getTask(id: ID): Task | null
  /** Convert tags: Tag[] → string[] before passing to model. */
  createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Task | null
  /** Convert tags: Tag[] → string[] if present before passing to model. */
  updateTask(id: ID, updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Task | null
  deleteTask(id: ID): boolean
  getDeletedTasks(params?: {limit?: number; branchId?: ID}): Task[]
  restoreTask(id: ID): Task | null
  permanentlyDeleteTask(id: ID): boolean
  permanentlyDeleteAllDeletedTasks(branchId?: ID): number
  /** Keep existing reorder logic (getOrderIndexBetween, normalizeTaskOrderIndexes). No hydration needed. */
  moveTaskByOrder(taskId: ID, targetDate: ISODate, newIndex: number, branchId?: ID): Task | null
  addTaskTags(taskId: ID, tagIds: ID[]): Task | null
  removeTaskTags(taskId: ID, tagIds: ID[]): Task | null
  addTaskAttachment(taskId: ID, fileId: ID): Task | null
  removeTaskAttachment(taskId: ID, fileId: ID): Task | null
}
```

### TagsService Contract

```typescript
import type {Tag} from "@shared/types/tag"

export class TagsService {
  constructor(tagModel: TagModel)

  getTagList(params?: {includeDeleted?: boolean}): Tag[]
  getTag(id: ID): Tag | null
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Tag | null
  updateTag(id: ID, updates: Partial<Pick<Tag, "color" | "name">>): Tag | null
  /** Direct delegation — TagModel handles task_tags cleanup in transaction. */
  deleteTag(id: ID): boolean
}
```

### FilesService Contract (from design/04-contracts.md section 3.10)

```typescript
class FilesService {
  constructor(fileModel: FileModel, taskModel: TaskModel)

  /** Generate ID, write to disk via saveAsset, INSERT metadata via fileModel. */
  async saveFile(filename: string, data: Buffer): Promise<ID>

  /**
   * Metadata from SQL, buffer from disk, 404 if deleted.
   * `Response` is a Node.js 18+ global (available in Electron's main process).
   * Returns: new Response(buffer, { headers: { "Content-Type": file.mimeType, "Content-Length": String(buffer.length) } })
   * 404 case: new Response("File not found", { status: 404, headers: { "Content-Type": "text/plain" } })
   */
  async createFileResponse(id: ID): Promise<Response>

  /**
   * No parameter needed — queries SQL directly.
   * Uses fileModel.getReferencedFileIds() for task_attachments references.
   * Uses taskModel.getTaskList() + extractFileIds(content: string): string[]
   * (from @/utils/files/extractFileIds, existing at src/main/utils/files/extractFileIds.ts)
   * to find inline image references in task content.
   * Combines both sets, deletes unreferenced files via fileModel.deleteFile() + fileModel.deleteAsset().
   * Also calls fileModel.cleanupOrphanAssets(validFileIds) for disk cleanup.
   */
  async cleanupOrphanFiles(): Promise<void>
}
```

### StorageController Init Flow (from design/02-data-flow.md section 1)

```
1. StorageController.init()
2. fs.ensureDir(appDataRoot, assetsDir)
3. initDatabase(sqlitePath) → db instance
4. Skip migration check (Phase 4)
5. fileModel.initAssets()  // assetsDir from constructor, no parameter
6. Instantiate 5 models (all receive db: Database)
7. branchModel.ensureMainBranch()
8. Instantiate 7 services
9. Instantiate SyncEngine (keep PouchDB-based adapters for now — Phase 5 rewrites them)
10. loadSettings → restore auto-sync
11. searchService.initializeIndex()
```

Note: SyncEngine and its adapters are NOT changed in this phase. They will temporarily not function (sync disabled) until Phase 5 rewrites them. If sync was enabled, it will gracefully error and set status to "error" until Phase 5.

### IStorageController Interface — Unchanged

File: `src/main/storage/StorageController.ts` (no separate interface file — the class IS the interface).
All 40+ public method signatures remain identical. `cleanupOrphanFiles()` internal implementation changes (no longer passes tasks) but the public call signature was already `Promise<void>`.

### Sync Adapter Import Verification

`LocalStorageAdapter` (`src/main/storage/sync/adapters/LocalStorageAdapter.ts`) imports types from `@/types/database` — NOT from `@/storage/database`. It does NOT import the PouchDB singleton. Therefore, removing the `getDB` import from StorageController does NOT break sync adapter compilation. The adapters will fail at runtime (PouchDB API calls) but compile fine — Phase 5 rewrites them.

## 6. Validation Gates

### Automated

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck:main` passes
- [ ] `StorageController` imports `initDatabase` from new module, not `getDB` from old
- [ ] `DaysService` has no `TagModel` dependency
- [ ] `TasksService` has no `TagModel` dependency
- [ ] `TagsService` has no `TaskModel` dependency
- [ ] No imports of `_mappers.ts` (old mappers) in any service or controller
- [ ] `FilesService.createFileResponse` does not reference `_attachments` or base64

### Manual

- [ ] `pnpm dev` — app starts successfully with SQLite
- [ ] Create a task → task appears in the day view
- [ ] Add tags to a task → tags displayed correctly
- [ ] Create a new tag → tag appears in tag list
- [ ] Delete a tag → tag removed from all tasks
- [ ] Attach a file to a task → file appears, viewable via `daily://file/{id}`
- [ ] Move task to different day → task moves correctly
- [ ] Reorder tasks → order persists across refresh
- [ ] Delete and restore a task → works correctly
- [ ] Permanently delete a task → removed from deleted list
- [ ] Switch branches → correct tasks displayed
- [ ] Settings save/load → all settings persist

## Scope Boundary

This phase does NOT:

- Implement PouchDB→SQLite data migration (Phase 4)
- Rewrite sync adapters or SyncEngine (Phase 5)
- Remove any PouchDB source files (Phase 7)
- Delete `_mappers.ts` or `database.ts` (Phase 7)

SyncEngine will temporarily malfunction (graceful error, status="error") until Phase 5. This is acceptable.

## 7. Implementation Note

After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.
