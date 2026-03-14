# 02 — Data Flow: SQLite Migration

## 1. Application Init (Success Path)

```
1. Electron main process starts
2. StorageController.init() called
3. fs.ensureDir(appDataRoot)          → ~/Library/Application Support/Daily/
4. fs.ensureDir(assetsDir)            → ~/Library/Application Support/Daily/assets/
5. initDatabase(sqlitePath)           → ~/Library/Application Support/Daily/db/daily.sqlite
   5a. new Database(sqlitePath)       → better-sqlite3 opens/creates file
   5b. PRAGMA journal_mode = WAL
   5c. PRAGMA foreign_keys = ON
   5d. PRAGMA busy_timeout = 5000
   5e. PRAGMA synchronous = NORMAL
   5f. runMigrations(db)              → applies v001 if _migrations table empty
6. Check isMigrationNeeded(pouchdbPath, db)
   6a. PouchDB dir exists? + SQLite tasks table empty? + no .migrated flag?
   6b. If yes → migratePouchDBToSQLite(pouchdbPath, db, assetsDir)
       - Open PouchDB, allDocs with attachments
       - BEGIN transaction
       - Insert branches, tags, tasks, task_tags, files, task_attachments, settings
       - Extract base64 file data → write to assets/
       - COMMIT
       - markMigrationComplete(dbDir, result)
7. initAssets(assetsDir)
8. Instantiate 5 models (all receive db: Database)
9. branchModel.ensureMainBranch()     → INSERT OR IGNORE
10. Instantiate 7 services
11. Instantiate SyncEngine with LocalStorageAdapter(db) + RemoteStorageAdapter
12. loadSettings → restore auto-sync if enabled
13. searchService.initializeIndex()    → loads all tasks from SQLite into memory index
14. Init complete → renderer can call IPC
```

## 2. Application Init (Error Path)

```
1-4. Same as success
5. initDatabase fails (corrupt file, permissions)
   → Error thrown, app shows error dialog, does not start
6. isMigrationNeeded returns true but migratePouchDBToSQLite fails
   6a. PouchDB can't open → MigrationResult.success = false, warnings logged
   6b. SQLite transaction rolled back → DB remains empty
   6c. App logs error, continues with empty DB (user data preserved in PouchDB)
   6d. Next launch will retry migration
7-14. If migration failed, app runs with empty DB
      User can manually trigger re-migration or restore from iCloud sync
```

## 3. getDays (Success Path)

```
1. Renderer calls IPC `days:get-many` with {from, to, branchId}
2. IPC handler → StorageController.getDays(params)
3. StorageController resolves branchId → DaysService.getDays(params)
4. DaysService → TaskModel.getTaskList({from, to, branchId})
5. TaskModel executes prepared SQL:
   SELECT t.*,
     (SELECT json_group_array(json_object(...)) FROM task_tags tt JOIN tags tg ...) AS tags_json,
     (SELECT json_group_array(f.id) FROM task_attachments ta JOIN files f ...) AS attachments_json
   FROM tasks t
   WHERE t.branch_id = ? AND t.scheduled_date BETWEEN ? AND ? AND t.deleted_at IS NULL
   ORDER BY t.scheduled_date, t.order_index
6. TaskModel maps rows → Task[] (tags already hydrated, attachments already resolved)
7. DaysService groups Task[] into Day[] via groupTasksByDay (single O(N) pass)
   - Buckets by scheduled.date
   - Accumulates unique tags per day
   - Counts active/done per day
8. Returns Day[] to StorageController → IPC → Renderer
```

## 4. createTask (Success Path)

```
1. Renderer calls IPC `tasks:create` with task data
2. IPC handler → StorageController.createTask(task)
3. StorageController → TasksService.createTask(task)
4. TasksService converts tags: Tag[] → tagIds: string[]
5. TasksService → TaskModel.createTask(taskInternal)
6. TaskModel runs transaction:
   BEGIN
   INSERT INTO tasks (id, status, content, ...) VALUES (nanoid(), ...)
   INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?) × N tags
   INSERT INTO task_attachments (task_id, file_id) VALUES (?, ?) × N attachments
   COMMIT
7. TaskModel fetches created task with hydrated tags (getTask(id))
8. Returns Task to TasksService → StorageController
9. StorageController: notifyStorageDataChange() → broadcast to renderer
10. StorageController: searchService.addTaskToIndex(task)
11. Returns Task to renderer via IPC
```

## 5. deleteTag (Success Path — Cascade)

```
1. Renderer calls IPC `tags:delete` with tagId
2. IPC handler → StorageController.deleteTag(id)
3. StorageController → TagsService.deleteTag(id)
4. TagsService → TagModel.deleteTag(id)
5. TagModel runs transaction:
   BEGIN
   DELETE FROM task_tags WHERE tag_id = ?    ← removes all associations
   UPDATE tags SET deleted_at = now(), updated_at = now() WHERE id = ?
   COMMIT
6. Returns true
7. StorageController: notifyStorageDataChange()
8. StorageController: tagModel.invalidateCache() ← no-op (no cache in SQLite version)
```

## 6. saveFile (Success Path)

```
1. Renderer calls IPC `files:save` with {filename, data: Buffer}
2. IPC handler normalizes data to Buffer → StorageController.saveFile(filename, data)
3. StorageController → FilesService.saveFile(filename, data)
4. FilesService:
   a. Generate fileId = nanoid()
   b. Extract ext from filename
   c. Resolve mimeType from extension
   d. saveAsset(fileId, ext, data)           → fs.writeFile(assets/{fileId}.{ext}, data)
   e. fileModel.createFile(fileId, name, mimeType, data.length)  → INSERT INTO files
5. Returns fileId to StorageController → IPC → Renderer
```

## 7. createFileResponse (Success Path — Protocol Handler)

```
1. Renderer <img> or fetch to daily://file/{id}
2. Protocol handler extracts id from URL
3. → StorageController.createFileResponse(id)
4. → FilesService.createFileResponse(id)
5. FilesService:
   a. fileModel.getFile(id)                  → SELECT * FROM files WHERE id = ?
   b. If deletedAt set → return 404 Response
   c. Determine ext from file.name
   d. readAssetBuffer(id, ext)               → fs.readFile(assets/{id}.{ext})
   e. Return new Response(buffer, {Content-Type: mimeType, Content-Length: size})
6. Protocol handler returns Response to renderer
```

## 8. iCloud Sync (Success Path)

```
1. Scheduler fires (every 5 min) or user triggers forceSync()
2. SyncEngine.sync("pull") → mutex.runExclusive(...)
3. _sync("pull"):
   a. localStore.loadAllDocs()    → SQL SELECTs for all tables → SnapshotV2Docs
   b. remoteStore.loadSnapshot()  → read snapshot.v2.json (with retry + .icloud check)
   c. If remote is v1: convertV1ToV2(remoteDocs)  ← strips prefixes, extracts attachments
   d. Compare hashes → if equal, return early
   e. mergeRemoteIntoLocal(localDocs, remoteDocs, "pull", gcIntervalMs)
      - mergeCollections for tasks, tags, branches, files (remote wins tie)
      - mergeSettings(local, remote, "pull") (remote wins tie — FIXED)
      - GC: remove records where deletedAt + TTL expired
   f. If changes: localStore.upsertDocs(mergedDocs)  → INSERT OR REPLACE in transaction
   g. If changes: localStore.deleteDocs(toRemove)     → DELETE in transaction
   h. If changes: onDataChanged() → invalidate caches → broadcast to renderer
   i. Compare result hash vs remote hash
   j. If push needed: buildSnapshot(resultDocs) → remoteStore.saveSnapshot(v2)
      - Write to snapshot.v2.json.tmp then rename (atomic)
   k. remoteStore.syncAssets(localAssetsDir, fileManifest)
      - Copy new local files → sync/assets/
      - Copy new remote files → local assets/
4. Set status → "active"
```

## 9. iCloud Sync (Error Path)

```
1. SyncEngine.sync() → mutex acquired
2. _sync():
   a. remoteStore.loadSnapshot():
      - .icloud placeholder detected → return null → skip pull, push local
      - JSON.parse fails (corrupt) → log warning, return null → push local only
      - fs.readFile fails → retry 3x (500ms, 1s, 2s backoff) → if all fail, return null
   b. localStore.loadAllDocs() fails (SQLite error):
      - Set status → "error", throw
   c. mergeRemoteIntoLocal fails:
      - Set status → "error", throw (no partial writes — merge is pure function)
   d. localStore.upsertDocs fails (SQL constraint violation):
      - Transaction rolled back, set status → "error"
   e. remoteStore.saveSnapshot fails:
      - Atomic write ensures no corrupt snapshot (tmp file deleted on failure)
      - Set status → "error"
   f. remoteStore.syncAssets fails (individual file copy):
      - Log warning per file, continue with remaining files
      - Set status → "active" (partial asset sync is non-fatal)
3. Mutex released → next sync can proceed
```

## 10. PouchDB Migration (Error Path)

```
1. StorageController.init() detects migration needed
2. migratePouchDBToSQLite(pouchdbPath, db, assetsDir):
   a. PouchDB open fails → throw → migration aborted
   b. allDocs fails → throw → migration aborted
   c. SQLite INSERT fails (constraint violation):
      - Individual record warning logged
      - Transaction continues (tolerant of bad data)
   d. File asset write fails (disk full, permissions):
      - Warning logged for that file
      - File metadata skipped in SQL (no orphan reference)
   e. Transaction COMMIT fails → all SQL rolled back
      - Asset files already written remain as orphans (cleaned up later)
3. On any throw: isMigrationNeeded returns true next launch → retry
4. markMigrationComplete NOT called → migration retries on next start
```
