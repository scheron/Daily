# 01 — Architecture: SQLite Migration

## Target Architecture

### New Layer Stack

The current five-layer PouchDB stack is replaced by a four-layer SQLite stack. The Mappers layer (PouchDB document ID prefixes, `_rev` fields, base64 encoding) collapses into simple row-to-domain functions within models. Tag hydration moves from Services into SQL JOINs.

```
Renderer (Vue) → Pinia Store → API → IPC → StorageController (Facade)
                                                   │
                                            Services Layer
                                            (simplified: no hydration,
                                             SQL transactions replace retry)
                                                   │
                                            Models Layer
                                            (prepared SQL statements,
                                             row→domain mappers inline)
                                                   │
                                            SQLite (better-sqlite3, WAL mode)
                                                   │
                                        Disk-based File Storage
                                        (assets/{fileId}.{ext})
```

Sync subsystem:

```
SyncEngine (+ AsyncMutex) ← createIntervalScheduler (5-min)
       │                │
LocalStorageAdapter    RemoteStorageAdapter
(SQLite queries)       (atomic write, retry, .icloud handling)
       │                │
  daily.sqlite     snapshot.v2.json (v2, no binary) + sync/assets/
```

### Why These Changes

1. **PouchDB forces tag hydration in every read path.** DaysService, TasksService, SearchService all do parallel fetch tasks + all tags → build `Map<id, Tag>` → map each task's `tags: string[]` (research section 3, lines 166-178). SQL JOINs with `json_group_array` eliminate this.

2. **PouchDB's revision-based conflict model is unnecessary for local-first single-writer.** `withRetryOnConflict` is called from 12 locations (research section 2, lines 398-413). SQLite transactions replace all of this.

3. **Base64 file attachments inflate DB by 33% and make sync snapshots enormous** (research section 2, lines 125-126; research section 7, lines 361-376). Disk files enable streaming and incremental sync.

4. **TTL caches compensate for PouchDB query latency** (research section 2, lines 68, 90, 103). SQLite indexed reads make caches unnecessary.

5. **Tag cascade deletes load ALL tasks into memory** (research section 3, lines 200-204). `DELETE FROM task_tags WHERE tag_id = ?` replaces O(N) JS operation.

---

## Component Boundaries

### NEW Components

| Component                                                | Purpose                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `src/main/storage/database/instance.ts`                  | SQLite init: WAL, `PRAGMA foreign_keys = ON`, migrations |
| `src/main/storage/database/migrations/`                  | Versioned SQL migration files (v001 = full schema)       |
| `src/main/storage/database/scripts/migrate.ts`           | Migration runner with version tracking                   |
| `src/main/storage/database/scripts/pouchdb-to-sqlite.ts` | One-time PouchDB→SQLite data migration                   |

### CHANGED Components

| Component                                                | Nature of Change                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/storage/models/TaskModel.ts`                   | Full rewrite: PouchDB → SQL prepared statements. Remove `withRetryOnConflict`, `applyDiffToDoc`. (research:71-86)                            |
| `src/main/storage/models/TagModel.ts`                    | Full rewrite: remove TTL cache, SQL queries. (research:88-101)                                                                               |
| `src/main/storage/models/BranchModel.ts`                 | Full rewrite: remove TTL cache, `INSERT OR IGNORE` for ensureMain. (research:103-115)                                                        |
| `src/main/storage/models/FileModel.ts`                   | Full rewrite: metadata in SQL, binary via assets approach. Disk-based file I/O: save, read stream, delete, orphan cleanup (research:117-127) |
| `src/main/storage/models/SettingsModel.ts`               | Full rewrite: remove AsyncMutex, `INSERT OR REPLACE`. (research:129-136)                                                                     |
| `src/main/storage/services/DaysService.ts`               | Simplify: single SQL query replaces parallel fetch + hydration + grouping. (research:166-174)                                                |
| `src/main/storage/services/TasksService.ts`              | Simplify: remove tag hydration, use SQL transactions for reorder. (research:176-196)                                                         |
| `src/main/storage/services/TagsService.ts`               | Simplify: cascade via `DELETE FROM task_tags`. (research:198-204)                                                                            |
| `src/main/storage/services/FilesService.ts`              | Rewrite: disk streaming instead of base64 decode. (research:206-215)                                                                         |
| `src/main/storage/StorageController.ts`                  | Minor: init SQLite instead of PouchDB. Interface preserved. (research:232-242)                                                               |
| `src/main/storage/sync/SyncEngine.ts`                    | Fix: add `AsyncMutex` around `_sync()`. (research:335)                                                                                       |
| `src/main/storage/sync/adapters/LocalStorageAdapter.ts`  | Rewrite: SQL read/write. (research:337-349)                                                                                                  |
| `src/main/storage/sync/adapters/RemoteStorageAdapter.ts` | Fix: atomic write, retry, `.icloud` handling. (research:351-358)                                                                             |
| `src/main/utils/sync/merge/mergeSettings.ts`             | Fix: unify tie-break. (research:396)                                                                                                         |
| `src/main/utils/sync/snapshot/buildSnapshot.ts`          | Snapshot v2 format. (research:377-381)                                                                                                       |
| `src/main/config.ts`                                     | Fix: `app.getPath("home")`. New paths: sqlitePath, assetsDir. (research:317)                                                                 |
| `package.json`                                           | Add `better-sqlite3`, eventually remove `pouchdb*`. (research:510-515)                                                                       |
| `electron-builder.json`                                  | Native module config for `better-sqlite3`. (research:523-527)                                                                                |

### DELETED Components

| Component                               | Reason                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `src/main/storage/database.ts`          | PouchDB singleton, replaced by `database/instance.ts`. (research:21-31) |
| `src/main/storage/models/_mappers.ts`   | Doc ID prefix logic, not needed with SQL tables. (research:53-63)       |
| `src/main/utils/withRetryOnConflict.ts` | Replaced by SQL transactions. (research:67)                             |
| `src/main/utils/createCacheLoader.ts`   | No longer needed with SQLite. (research:68)                             |

### UNTOUCHED Components

| Component                                    | Why Unchanged                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| All `src/renderer/`                          | IPC contract preserved. (epic: non-goals)                                                 |
| `src/main/setup/ipc/storage.ts`              | 35 channels map 1:1 to unchanged controller. (research:246-263)                           |
| `src/main/setup/app/storage.ts`              | Event broadcasts unchanged. (research:267-270)                                            |
| `src/shared/types/storage.ts`                | Domain types unchanged. (research:417-491)                                                |
| `src/shared/types/common.ts`                 | Primitive aliases unchanged. (research:419-421)                                           |
| `src/main/types/storage.ts`                  | `IStorageController` preserved. (research:502-504)                                        |
| `src/main/storage/services/SearchService.ts` | In-memory index, no DB-specific logic. (research:217-228)                                 |
| `src/main/utils/AsyncMutex.ts`               | Retained for SyncEngine. (research:69)                                                    |
| `src/main/utils/createIntervalScheduler.ts`  | Scheduler logic unchanged. (research:299)                                                 |
| `src/main/setup/security/protocols.ts`       | Protocol scheme unchanged; only `createFileResponse` internals change. (research:276-288) |

---

## Architectural Decisions (ADR-lite)

### ADR-1: Use `better-sqlite3` as the SQLite driver

- **Decision**: Use `better-sqlite3` (synchronous, native N-API) as the sole persistence engine.
- **Research basis**: PouchDB uses LevelDB with no explicit adapter (research:28). `externalizeDepsPlugin` handles native modules (research:520-525). Epic targets `better-sqlite3` (epic:17).
- **Rationale**: Synchronous API simplifies transactions. WAL mode enables concurrent reads. Native performance meets <20ms `getDays` target (epic:43).

### ADR-2: Join tables for many-to-many relationships

- **Decision**: Use `task_tags` and `task_attachments` join tables instead of array columns.
- **Research basis**: PouchDB stores `tags: string[]` in documents requiring hydration in every read path (research:166-173, 177-178). TagsService.deleteTag loads ALL tasks (research:200-204).
- **Rationale**: SQL JOINs for hydration (zero JS overhead), `ON DELETE CASCADE` for tag removal, FK constraints for integrity. Directly addresses N+1 pattern (epic:7-8).

### ADR-3: Eliminate TTL caches and `withRetryOnConflict`

- **Decision**: Remove `createCacheLoader` (5-min TTL on TagModel, BranchModel) and `withRetryOnConflict` (12 call sites).
- **Research basis**: Caches compensate for PouchDB latency (research:68, 90, 103). Retry handles PouchDB 409 conflicts (research:67, 398-413). SQLite has no revision system.
- **Rationale**: Artifacts of document-store model. Removal simplifies codebase and eliminates stale-cache bugs.

### ADR-4: Disk-based file storage with streaming reads

- **Decision**: Binary files on disk at `assets/{fileId}.{ext}`, metadata in `files` SQL table.
- **Research basis**: PouchDB stores base64 in `_attachments` (+33% overhead, research:125-126). FilesService decodes base64 into buffer (research:283-288). Sync snapshot includes all file data (research:361-376).
- **Rationale**: `fs.createReadStream` for zero-copy streaming via `daily://`. Eliminates base64 overhead. Enables incremental sync. Epic specifies this approach (epic:155-190).

### ADR-5: Tag hydration via SQL subqueries

- **Decision**: Replace JS tag hydration with `json_group_array`/`json_object` SQL subqueries.
- **Research basis**: Hydration in DaysService (research:171-173), TasksService (research:177-178), SearchService (research:224). Dominant performance bottleneck.
- **Rationale**: Single query returns fully hydrated tasks. Epic's `getDays` query template (epic:289-309). Eliminates parallel fetch pattern.

### ADR-6: Snapshot v2 without binary data

- **Decision**: New snapshot excludes file binaries. Files sync via `sync/assets/`. Backward-compatible v1 reading.
- **Research basis**: Current snapshot includes base64 attachments (research:361-376). Hash already strips `_attachments` (research:379). Full snapshot writes every 5 min (research:299).
- **Rationale**: Compact snapshots (<1MB). File immutability (nanoid IDs) means no file-level conflicts. Backward compat for mixed-version rollout.

### ADR-7: AsyncMutex on SyncEngine + atomic writes

- **Decision**: Wrap `_sync()` in `AsyncMutex`. Temp-file-plus-rename for snapshot writes.
- **Research basis**: No mutex on `_sync()` — forceSync and auto-sync can overlap (research:335). Raw `fs.writeFile` with no atomic write (research:351-358).
- **Rationale**: `AsyncMutex` exists in codebase (research:69), proven in SettingsModel. Atomic write via rename is standard on APFS.

### ADR-8: One-time PouchDB→SQLite migration with rollback safety

- **Decision**: Detect PouchDB data on first launch, migrate in SQLite transaction, keep PouchDB intact.
- **Research basis**: No migration system exists (research:537). Doc IDs use prefixes (research:53-62). `deletedAt = epoch` = permanent delete (research:84).
- **Rationale**: Single transaction ensures atomicity. Keeping PouchDB allows rollback via hotfix.

### ADR-9: Preserve `IStorageController` interface exactly

- **Decision**: 40+ method interface unchanged. All changes internal.
- **Research basis**: 35 IPC channels map 1:1 to controller (research:246-263, 749-787). Renderer uses IPC exclusively (research:15). Domain types shared (research:417-491).
- **Rationale**: Fundamental migration constraint. Epic non-goals: no renderer/IPC/preload changes (epic:25-29).

### ADR-10: Retain `groupTasksByDay` as post-SQL utility

- **Decision**: Keep utility simplified. SQL returns sorted, hydrated rows. Utility groups into `Day[]` in O(N).
- **Research basis**: Currently buckets by `scheduled.date`, accumulates per-day tag sets (research:173). `Day` includes `countActive`, `countDone` (research:486).
- **Rationale**: SQL handles filtering/joining/sorting. Grouping into nested objects is application-level. O(N) pass over pre-sorted results is trivial.

---

## Open Questions

1. **`better-sqlite3` electron-builder integration**: Does the existing `afterPack-mac.js` signing script handle `better-sqlite3` generically, or does it need modification? (research:523-527)

   > Need to modification. Create specific plan phase for that.

2. **`NSFileCoordinator` scope**: Epic proposes atomic write + retry as minimum (epic:371-376). Should we mandate native binding or defer to future epic?

   > Mandate native binding. Create specific plan phase for that

3. **`TaskInternal` type**: With join tables, `TaskInternal` may become identical to `Task`. Should it be removed or kept for flexibility? (research:456-458)

   > If can be removed, do it.

4. **Migration UX**: Large databases may take seconds. Blocking splash vs. progress screen — product decision needed.

   > No need additional ux for migration.

5. **Snapshot v2 version negotiation**: PouchDB device reading v2 snapshot. Should v2 include format version for "please update" message on old apps?

   > No need. When new version released, we automatically call single migrate script. and snapshot v1 no longer needed.

6. **`sort_order` on tags**: Epic schema adds it (epic:68), but current `Tag` type has no such field (research:466-469). New feature or deferred?
   > It is mistake, no need tort order on tags. tags sorted by name.
