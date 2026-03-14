# 03 — Sequence Diagrams: SQLite Migration

## 1. Application Init (Main Success Path)

```mermaid
sequenceDiagram
    participant E as Electron Main
    participant SC as StorageController
    participant DB as SQLite (database.ts)
    participant MIG as PouchDB Migration
    participant A as Assets Module
    participant M as Models (5)
    participant S as Services (7)
    participant SE as SyncEngine
    participant SR as SearchService

    E->>SC: init()
    SC->>SC: fs.ensureDir(appDataRoot, assetsDir)
    SC->>DB: initDatabase(sqlitePath)
    DB->>DB: new Database(sqlitePath)
    DB->>DB: PRAGMA journal_mode=WAL, foreign_keys=ON
    DB->>DB: runMigrations(db)
    DB-->>SC: db instance

    SC->>MIG: isMigrationNeeded(pouchdbPath, db)
    alt PouchDB exists & SQLite empty
        MIG-->>SC: true
        SC->>MIG: migratePouchDBToSQLite(pouchdbPath, db, assetsDir)
        MIG->>MIG: Open PouchDB, allDocs()
        MIG->>DB: BEGIN transaction
        MIG->>DB: INSERT branches, tags, tasks, task_tags, files, task_attachments, settings
        MIG->>A: saveAsset() for each file (base64 decode → disk)
        MIG->>DB: COMMIT
        MIG->>MIG: markMigrationComplete()
        MIG-->>SC: MigrationResult
    else No migration needed
        MIG-->>SC: false
    end

    SC->>A: initAssets(assetsDir)
    SC->>M: new TaskModel(db), TagModel(db), BranchModel(db), FileModel(db), SettingsModel(db)
    SC->>M: branchModel.ensureMainBranch()
    SC->>S: new DaysService, TasksService, TagsService, FilesService, SearchService, SettingsService, BranchesService
    SC->>SE: new SyncEngine(localAdapter, remoteAdapter)
    SC->>SR: initializeIndex()
    SR->>M: taskModel.getTaskList() (all tasks)
    M->>DB: SELECT with JOINs
    DB-->>M: rows
    M-->>SR: Task[]
    SR->>SR: build in-memory index
    SC-->>E: init complete
```

## 2. getDays (Main Success Path)

```mermaid
sequenceDiagram
    participant R as Renderer
    participant IPC as IPC Handler
    participant SC as StorageController
    participant DS as DaysService
    participant TM as TaskModel
    participant DB as SQLite

    R->>IPC: days:get-many {from, to, branchId}
    IPC->>SC: getDays(params)
    SC->>SC: resolveBranchId(branchId)
    SC->>DS: getDays({from, to, branchId})
    DS->>TM: getTaskList({from, to, branchId})
    TM->>DB: SELECT t.*, tags_json, attachments_json FROM tasks t WHERE branch_id=? AND scheduled_date BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY scheduled_date, order_index
    DB-->>TM: rows (tags & attachments already in JSON columns)
    TM->>TM: rowToTask() for each row (parse JSON, map snake→camel)
    TM-->>DS: Task[] (fully hydrated)
    DS->>DS: groupTasksByDay(tasks) → Day[]
    DS-->>SC: Day[]
    SC-->>IPC: Day[]
    IPC-->>R: Day[]
```

## 3. iCloud Sync (Success Path)

```mermaid
sequenceDiagram
    participant Sched as Scheduler (5-min)
    participant SE as SyncEngine
    participant Mutex as AsyncMutex
    participant LA as LocalStorageAdapter
    participant RA as RemoteStorageAdapter
    participant DB as SQLite
    participant FS as Filesystem (iCloud)
    participant Merge as mergeRemoteIntoLocal

    Sched->>SE: sync("pull")
    SE->>Mutex: runExclusive()
    Mutex-->>SE: lock acquired
    SE->>SE: setStatus("syncing")

    par Load local and remote
        SE->>LA: loadAllDocs()
        LA->>DB: SELECT * FROM tasks, tags, branches, files, settings, task_tags, task_attachments
        DB-->>LA: rows
        LA-->>SE: SnapshotV2Docs (local)
    and
        SE->>RA: loadSnapshot()
        RA->>FS: check .icloud placeholder
        RA->>FS: fs.readFile(snapshot.v2.json) with retry
        RA->>RA: JSON.parse + validate + detect version
        RA-->>SE: Snapshot (v1 or v2)
    end

    alt Remote is v1
        SE->>SE: convertV1ToV2(remoteDocs)
    end

    SE->>SE: compare hashes
    alt Hashes differ
        SE->>Merge: mergeRemoteIntoLocal(local, remote, "pull", gcIntervalMs)
        Merge-->>SE: {resultDocs, toUpsert, toRemove, changes}

        SE->>LA: upsertDocs(toUpsert)
        LA->>DB: BEGIN; INSERT OR REPLACE ...; COMMIT
        SE->>LA: deleteDocs(toRemove)
        LA->>DB: BEGIN; DELETE ...; COMMIT

        SE->>SE: onDataChanged() → broadcast to renderer

        SE->>SE: compare result hash vs remote hash
        alt Push needed
            SE->>SE: buildSnapshot(resultDocs) → SnapshotV2
            SE->>RA: saveSnapshot(v2)
            RA->>FS: write snapshot.v2.json.tmp
            RA->>FS: rename → snapshot.v2.json (atomic)
        end

        SE->>RA: syncAssets(localAssetsDir, fileManifest)
        RA->>FS: copy new files local↔remote
    end

    SE->>SE: setStatus("active")
    SE->>Mutex: release
```

## 4. iCloud Sync (Error Path — Corrupt Snapshot)

```mermaid
sequenceDiagram
    participant SE as SyncEngine
    participant Mutex as AsyncMutex
    participant RA as RemoteStorageAdapter
    participant FS as Filesystem (iCloud)
    participant LA as LocalStorageAdapter

    SE->>Mutex: runExclusive()
    SE->>SE: setStatus("syncing")

    par
        SE->>LA: loadAllDocs() → SnapshotV2Docs (local)
    and
        SE->>RA: loadSnapshot()
        RA->>FS: fs.readFile(snapshot.v2.json)
        FS-->>RA: partial/corrupt data
        RA->>RA: JSON.parse() throws
        RA->>RA: retry #1 (500ms backoff)
        RA->>FS: fs.readFile(snapshot.v2.json)
        FS-->>RA: still corrupt
        RA->>RA: retry #2 (1s backoff)
        RA->>FS: fs.readFile(snapshot.v2.json)
        FS-->>RA: still corrupt
        RA->>RA: log warning: "Snapshot corrupt after 3 retries"
        RA-->>SE: null
    end

    Note over SE: Remote is null → no merge, just push local
    SE->>SE: buildSnapshot(localDocs) → SnapshotV2
    SE->>RA: saveSnapshot(v2)
    RA->>FS: write snapshot.v2.json.tmp
    RA->>FS: rename → snapshot.v2.json (atomic)
    SE->>SE: setStatus("active")
    SE->>Mutex: release
```

## 5. PouchDB Migration (Error Path)

```mermaid
sequenceDiagram
    participant SC as StorageController
    participant MIG as Migration
    participant PDB as PouchDB
    participant DB as SQLite
    participant A as Assets

    SC->>MIG: isMigrationNeeded() → true
    SC->>MIG: migratePouchDBToSQLite()
    MIG->>PDB: new PouchDB(path)
    PDB-->>MIG: db instance
    MIG->>PDB: allDocs({include_docs, attachments})
    PDB-->>MIG: docs[]

    MIG->>DB: BEGIN transaction
    MIG->>DB: INSERT branches...
    MIG->>DB: INSERT tags...
    MIG->>DB: INSERT tasks...

    Note over MIG,A: File extraction
    MIG->>A: saveAsset(fileId, ext, decodedBuffer)
    A-->>MIG: ERROR (disk full)
    MIG->>MIG: log warning, skip this file

    MIG->>DB: INSERT remaining records...
    MIG->>DB: COMMIT

    alt Commit succeeds
        MIG->>MIG: markMigrationComplete()
        MIG-->>SC: MigrationResult{success: true, warnings: ["file X skipped"]}
    else Commit fails
        DB->>DB: ROLLBACK
        MIG-->>SC: throws Error
        Note over SC: App continues with empty SQLite DB<br/>PouchDB untouched<br/>Migration retries next launch
    end
```

## 6. File Save + Protocol Read

```mermaid
sequenceDiagram
    participant R as Renderer
    participant IPC as IPC Handler
    participant FS as FilesService
    participant FM as FileModel
    participant A as Assets Module
    participant DB as SQLite
    participant Disk as Filesystem
    participant Proto as Protocol Handler

    Note over R,Disk: Save file
    R->>IPC: files:save {filename, data: Buffer}
    IPC->>FS: saveFile(filename, data)
    FS->>FS: fileId = nanoid(), ext = extname(filename)
    FS->>A: saveAsset(fileId, ext, data)
    A->>Disk: fs.writeFile(assets/{fileId}.{ext}, data)
    FS->>FM: createFile(fileId, name, mimeType, size)
    FM->>DB: INSERT INTO files VALUES(...)
    FS-->>IPC: fileId
    IPC-->>R: fileId

    Note over R,Disk: Read file via protocol
    R->>Proto: fetch(daily://file/{fileId})
    Proto->>FS: createFileResponse(fileId)
    FS->>FM: getFile(fileId)
    FM->>DB: SELECT * FROM files WHERE id=?
    DB-->>FM: row
    FM-->>FS: File metadata
    FS->>A: readAssetBuffer(fileId, ext)
    A->>Disk: fs.readFile(assets/{fileId}.{ext})
    Disk-->>A: Buffer
    A-->>FS: Buffer
    FS-->>Proto: new Response(buffer, headers)
    Proto-->>R: HTTP Response with file data
```
