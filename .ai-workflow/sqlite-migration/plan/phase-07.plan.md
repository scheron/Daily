---
phase: 07
name: Cleanup + PouchDB Removal
feature_slug: sqlite-migration
design: .ai-workflow/sqlite-migration/design/
status: pending
---

# Phase 07: Cleanup + PouchDB Removal

## 1. Goal

Remove all PouchDB dependencies, delete obsolete files (PouchDB database module, old mappers, retry utility, cache utility), remove the DBViewer feature (view, window, IPC, menu items), and update/adapt database utility scripts for SQLite. After this phase, PouchDB is fully gone from the codebase, bundle size is reduced, and there are no dead code paths.

## 2. Context

### Current State Analysis

After Phases 1-6, the app runs entirely on SQLite. PouchDB code remains in the codebase but is unused (except potentially by the migration script in Phase 4, which dynamically imports it). The following are now dead code:

**Files to delete:**

- `src/main/storage/database.ts` — PouchDB singleton init (87 lines)
- `src/main/storage/models/_mappers.ts` — PouchDB doc ID prefix mappers (263 lines)
- `src/main/utils/withRetryOnConflict.ts` — PouchDB 409 retry wrapper
- `src/main/utils/createCacheLoader.ts` — TTL cache (no longer used by any model)

**DBViewer components to remove:**

- `src/renderer/src/ui/views/DBViewer/DBViewer.vue` — View component
- `src/renderer/src/ui/views/DBViewer/index.ts` — Barrel export
- Route `/db-viewer` in `src/renderer/src/router/index.ts` (line 12-14)
- `createDevToolsWindow()` in `src/main/windows.ts` (lines 215-250)
- `setupDbViewerIPC()` + `setupDevToolsIPC()` in `src/main/setup/ipc/devtools.ts`
- "DB Viewer" menu items in `src/main/setup/app/menu.ts` (lines 104-107, 181-184)
- `menu:devtools` handler in `src/main/setup/ipc/menu.ts` (line 14)
- `devTools: BrowserWindow | null` in `src/main/app.ts` AppWindows type (line 30)
- `setupDbViewerIPC` and `setupDevToolsIPC` imports + calls in `src/main/app.ts` (lines 16, 69, 84-88)
- `devTools` window config in `src/main/config.ts` (lines 67-72)

**Dependencies to remove:**

- `pouchdb` (^9.0.0) — production dependency
- `pouchdb-find` (^9.0.0) — production dependency
- `@types/pouchdb` (^6.4.2) — dev dependency

**Scripts to update:**

- `scripts/db/inspect-db.js` — currently uses PouchDB API to inspect DB
- `scripts/db/clear-db.js` — uses `db.destroy()`
- `scripts/db/seed.js` — generates sample data via PouchDB

### Architecture Context

**ADR-3:** Eliminate `createCacheLoader` and `withRetryOnConflict`. Both are artifacts of the PouchDB model.

The migration script (`pouchdb-to-sqlite.ts`) dynamically imports PouchDB. After this phase, PouchDB npm packages are removed but the migration script remains — it should be updated to handle the case where PouchDB packages are not installed (migration is a one-time operation, and after Phase 7, all users have already migrated).

### Key Discoveries

- `app.ts:16` — imports `setupDbViewerIPC, setupDevToolsIPC` from `@/setup/ipc/devtools`
- `app.ts:30` — `devTools: BrowserWindow | null` in AppWindows type
- `app.ts:32` — `windows` object includes `devTools: null`
- `app.ts:69` — `await setupDbViewerIPC()`
- `app.ts:84-88` — `setupDevToolsIPC(...)` with window getter/setter
- `menu.ts:104-107` — "DB Viewer" menu item emits `devtools:open`
- `menu.ts:181-184` — duplicate "DB Viewer" menu item
- `menu.ts:14` (ipc/menu.ts) — `menu:devtools` → `devtools:open` handler
- `config.ts:67-72` — `window.devTools` config (width/height settings)
- `router/index.ts:12-14` — `/db-viewer` route with lazy import
- PouchDB migration script should check if PouchDB packages are available before attempting import

### Desired End State

- `pouchdb`, `pouchdb-find`, `@types/pouchdb` removed from `package.json`
- All 4 obsolete utility files deleted
- DBViewer completely removed (view, route, window, IPC, menu items)
- `app.ts` has no devTools window references
- Database utility scripts work with SQLite (or are removed if not adaptable)
- `pnpm install` succeeds without PouchDB
- `pnpm lint` passes
- Bundle size reduced
- Migration script handles missing PouchDB gracefully (logs "PouchDB not installed, skipping migration check")

## 3. Files to Create or Modify

| File                                                     | Action            | Why                                                      |
| -------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `package.json`                                           | modify            | Remove pouchdb, pouchdb-find, @types/pouchdb             |
| `src/main/storage/database.ts`                           | delete            | PouchDB singleton, replaced by database/instance.ts      |
| `src/main/storage/models/_mappers.ts`                    | delete            | PouchDB doc ID prefix logic, replaced by \_rowMappers.ts |
| `src/main/utils/withRetryOnConflict.ts`                  | delete            | PouchDB 409 retry, replaced by SQL transactions          |
| `src/main/utils/createCacheLoader.ts`                    | delete            | TTL cache, no longer needed with SQLite                  |
| `src/renderer/src/ui/views/DBViewer/DBViewer.vue`        | delete            | PouchDB-specific viewer, no longer functional            |
| `src/renderer/src/ui/views/DBViewer/index.ts`            | delete            | Barrel export for deleted view                           |
| `src/renderer/src/router/index.ts`                       | modify            | Remove /db-viewer route                                  |
| `src/main/windows.ts`                                    | modify            | Remove createDevToolsWindow() function                   |
| `src/main/setup/ipc/devtools.ts`                         | delete            | DBViewer IPC handlers + DevTools window setup            |
| `src/main/setup/app/menu.ts`                             | modify            | Remove "DB Viewer" menu items                            |
| `src/main/setup/ipc/menu.ts`                             | modify            | Remove menu:devtools handler                             |
| `src/main/app.ts`                                        | modify            | Remove devTools window, DBViewer IPC imports/calls       |
| `src/main/config.ts`                                     | modify            | Remove window.devTools config                            |
| `src/main/storage/database/scripts/pouchdb-to-sqlite.ts` | modify            | Handle missing PouchDB packages gracefully               |
| `scripts/db/inspect-db.js`                               | rewrite or delete | Adapt for SQLite or remove                               |
| `scripts/db/clear-db.js`                                 | rewrite or delete | Adapt for SQLite or remove                               |
| `scripts/db/seed.js`                                     | rewrite or delete | Adapt for SQLite or remove                               |

## 4. Implementation Approach

1. **Remove PouchDB dependencies**
   - What to do: Remove `pouchdb`, `pouchdb-find` from `dependencies` and `@types/pouchdb` from `devDependencies` in `package.json`. Run `pnpm install`.
   - Acceptance check: `pnpm install` succeeds. `node_modules/pouchdb` does not exist.

2. **Delete obsolete source files**
   - What to do: Delete:
     - `src/main/storage/database.ts`
     - `src/main/storage/models/_mappers.ts`
     - `src/main/utils/withRetryOnConflict.ts`
     - `src/main/utils/createCacheLoader.ts`
   - Acceptance check: Files don't exist. No remaining imports of these files in the codebase.

3. **Remove DBViewer — Renderer**
   - What to do:
     - Delete `src/renderer/src/ui/views/DBViewer/` directory
     - Remove the `/db-viewer` route from `src/renderer/src/router/index.ts`
   - Acceptance check: No DBViewer component exists. Router has no db-viewer route.

4. **Remove DBViewer — Main Process**
   - What to do:
     - Delete `src/main/setup/ipc/devtools.ts` entirely
     - In `src/main/app.ts`:
       - Remove import of `setupDbViewerIPC, setupDevToolsIPC`
       - Remove `devTools: BrowserWindow | null` from `AppWindows` type
       - Remove `devTools: null` from `windows` object
       - Remove `await setupDbViewerIPC()` call
       - Remove `setupDevToolsIPC(...)` call and its arguments
     - In `src/main/windows.ts`: remove `createDevToolsWindow()` function
     - In `src/main/setup/app/menu.ts`: remove both "DB Viewer" menu items (lines ~104-107 and ~181-184)
     - In `src/main/setup/ipc/menu.ts`: remove `menu:devtools` → `devtools:open` handler
     - In `src/main/config.ts`: remove `window.devTools` config block
   - Acceptance check: No references to `devtools`, `devTools`, `DBViewer`, or `db-viewer` in main process code (except potentially in CHANGELOG.md).

5. **Update migration script for missing PouchDB**
   - What to do: In `src/main/storage/database/scripts/pouchdb-to-sqlite.ts`, wrap PouchDB import in try/catch. If PouchDB is not installed (import fails), `isMigrationNeeded` returns `false` and `migratePouchDBToSQLite` logs "PouchDB packages not available, migration not possible" and returns a result with `success: false`.
   - Acceptance check: App starts without PouchDB packages installed. No crash on missing import.

6. **Rewrite database utility scripts**
   - What to do: Rewrite all three scripts to use `better-sqlite3` directly:
     - `scripts/db/inspect-db.js`: Open `~/Library/Application Support/Daily/db/daily.sqlite` via `better-sqlite3`. List all tables (`SELECT name FROM sqlite_master WHERE type='table'`), then for each table print the row count (`SELECT COUNT(*) FROM <table>`). Output format: one line per table as `tableName: count`. Exit 0 on success, exit 1 with error if DB file not found.
     - `scripts/db/clear-db.js`: Open the SQLite file and run `DELETE FROM` on all data tables in FK-safe order: task_tags, task_attachments, tasks, tags, branches, files, settings. Do NOT delete the file itself (preserves schema and \_migrations). Print "Database cleared" on success.
     - `scripts/db/seed.js`: Open the SQLite file and INSERT sample data in a single transaction: 2 tags (`{id: 'tag-1', name: 'Work', color: '#ef4444'}`, `{id: 'tag-2', name: 'Personal', color: '#3b82f6'}`), 3 tasks (`{id: 'task-1', ...}`, `{id: 'task-2', ...}`, `{id: 'task-3', ...}` with `scheduled_date: new Date().toISOString().slice(0, 10)`, statuses: 'active', 'active', 'done', branch_id: 'main'), 2 task_tags (task-1→tag-1, task-2→tag-2), 0 files. Print counts after insert: "Seeded: 2 tags, 3 tasks, 2 task_tags".
   - Acceptance check: `pnpm db:inspect` outputs table names with counts. `pnpm db:clear:force` clears data without error.

## 5. Embedded Contracts

### Deleted Utilities (from design/04-contracts.md section 3.11)

| Utility               | File                                    | Status |
| --------------------- | --------------------------------------- | ------ |
| `withRetryOnConflict` | `src/main/utils/withRetryOnConflict.ts` | DELETE |
| `createCacheLoader`   | `src/main/utils/createCacheLoader.ts`   | DELETE |
| `_mappers.ts`         | `src/main/storage/models/_mappers.ts`   | DELETE |
| `database.ts`         | `src/main/storage/database.ts`          | DELETE |

### Dependency Changes (from design/04-contracts.md section 6)

| Action | Package          | Version  |
| ------ | ---------------- | -------- |
| REMOVE | `pouchdb`        | `^9.0.0` |
| REMOVE | `pouchdb-find`   | `^9.0.0` |
| REMOVE | `@types/pouchdb` | `^6.4.2` |

### DBViewer Removal — Complete List

| File                                  | What to Remove                                  |
| ------------------------------------- | ----------------------------------------------- |
| `src/renderer/src/ui/views/DBViewer/` | Entire directory                                |
| `src/renderer/src/router/index.ts`    | `/db-viewer` route (3 lines)                    |
| `src/main/setup/ipc/devtools.ts`      | Entire file                                     |
| `src/main/windows.ts`                 | `createDevToolsWindow()` function               |
| `src/main/setup/app/menu.ts`          | Two "DB Viewer" menu items                      |
| `src/main/setup/ipc/menu.ts`          | `menu:devtools` handler                         |
| `src/main/app.ts`                     | DevTools imports, type, window ref, setup calls |
| `src/main/config.ts`                  | `window.devTools` config                        |

## 6. Validation Gates

### Automated

- [ ] `pnpm install` succeeds without PouchDB packages
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck:main` passes
- [ ] `pnpm typecheck:render` passes
- [ ] `pnpm build` succeeds
- [ ] `grep -r "pouchdb\|PouchDB" src/ --exclude="pouchdb-to-sqlite.ts"` returns no results
- [ ] `grep -r "withRetryOnConflict\|createCacheLoader" src/` returns no results
- [ ] `grep -r "DBViewer\|db-viewer\|devtools:open" src/` returns no results
- [ ] `test ! -f src/main/storage/database.ts` — deleted file does not exist
- [ ] `test ! -f src/main/storage/models/_mappers.ts` — deleted file does not exist
- [ ] `test ! -f src/main/utils/withRetryOnConflict.ts` — deleted file does not exist
- [ ] `test ! -f src/main/utils/createCacheLoader.ts` — deleted file does not exist
- [ ] `test ! -d src/renderer/src/ui/views/DBViewer` — deleted directory does not exist
- [ ] `test ! -f src/main/setup/ipc/devtools.ts` — deleted file does not exist
- [ ] `ls node_modules/pouchdb 2>&1` returns "No such file or directory"

### Manual

- [ ] App starts and works normally
- [ ] All features functional (tasks, tags, branches, files, sync, search)
- [ ] Menu no longer shows "DB Viewer" option
- [ ] `pnpm db:inspect` outputs table names with row counts

### Database Utility Scripts

```
scripts/db/inspect-db.js
  - Opens ~/Library/Application Support/Daily/db/daily.sqlite via better-sqlite3
  - Lists all tables with row counts
  - Output format (stdout): "tableName: N" per line
  - Exit code: 0 success, 1 if DB file not found

scripts/db/clear-db.js
  - Opens SQLite file
  - DELETE FROM all data tables (not _migrations) in FK-safe order
  - Prints "Database cleared" on success
  - Exit code: 0 success, 1 on error

scripts/db/seed.js
  - Opens SQLite file
  - Inserts sample data in single transaction:
    2 tags, 3 tasks (today's date), 2 task_tags
  - Prints "Seeded: 2 tags, 3 tasks, 2 task_tags"
  - Exit code: 0 success, 1 on error
```

## Scope Boundary

This is the FINAL phase. After completion:

- PouchDB is fully removed from the codebase
- DBViewer feature is fully removed
- No new functionality is added — this is purely cleanup

## 7. Implementation Note

After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This is the final phase — after confirmation, the SQLite migration is complete.
