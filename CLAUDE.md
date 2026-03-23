# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Daily is an Electron + Vue 3 task management application with local-first data storage. It features:

- Day-centric task organization with markdown support
- SQLite (better-sqlite3) for local storage with iCloud synchronization
- Branch-based project isolation (multi-project support)
- Built-in AI assistant (remote OpenAI-compatible APIs + local llama.cpp models)
- Full-text search across tasks
- Multi-window architecture (main app, settings, assistant, about)
- Three-layer architecture: Electron main process, Vue 3 renderer, and shared types

**Tech Stack:** Electron 36, Vue 3, TypeScript, Pinia, SQLite (better-sqlite3), TailwindCSS 4, Vite

---

## Development Commands

### Core Commands

```bash
# Development
pnpm dev                    # Start dev server with hot reload

# Building
pnpm build                  # Build and package for macOS
pnpm build:compress         # Build without packaging (for testing)

# Type Checking (run all three before committing)
pnpm typecheck:main         # Check main process types
pnpm typecheck:render       # Check renderer process types
pnpm typecheck:shared       # Check shared types

# Code Quality
pnpm lint                   # ESLint with auto-fix
pnpm format                 # Prettier formatting
pnpm circular               # Check for circular dependencies (madge)
pnpm check:all              # Run lint + typecheck + circular together
```

### Testing Single Components

To test individual components during development:

1. Import component in a test view
2. Use `pnpm dev` and navigate to the view
3. Use Vue DevTools (Electron DevTools) for debugging

---

## Architecture Overview

### Three-Layer Architecture

**1. Main Process** (`src/main/`)

- **Entry Point:** `app.ts` - Electron lifecycle, storage init, AI init, IPC setup, window management
- **Windows:** `windows.ts` - Manages main window, splash, about, settings, and assistant windows
- **Storage Layer:**
  - `storage/StorageController.ts` - Central orchestrator for all data operations
  - `storage/database/instance.ts` - SQLite initialization (better-sqlite3)
  - `storage/database/migrations/` - SQL schema migrations (versioned)
  - `storage/models/` - Direct SQLite CRUD (TaskModel, TagModel, BranchModel, SettingsModel, FileModel)
  - `storage/models/_rowMappers.ts` - SQL row ↔ domain object mapping
  - `storage/services/` - Business logic (TasksService, TagsService, BranchesService, DaysService, SettingsService, FilesService, SearchService)
  - `storage/search/` - Full-text search (SearchEngine, TaskSearchIndex)
  - `storage/sync/SyncEngine.ts` - Local-first sync with iCloud (LWW merge strategy)
- **AI Module:** `ai/` - AI assistant subsystem
  - `AIController.ts` - Orchestrates AI operations
  - `clients/remote/` - OpenAI-compatible API client
  - `clients/local/` - Local llama.cpp integration with model management
  - `tools/` - Tool definitions for structured AI actions
  - `promts/` - System prompts (full, compact, tiny tiers)
- **Updates:** `updates/UpdaterController.ts` - Auto-update management
- **IPC:** `setup/ipc/` - Handles inter-process communication via `ipcMain.handle()`

**2. Renderer Process** (`src/renderer/src/`)

- **Entry Point:** `main.ts` - Vue app with Pinia and Vue Router
- **API Layer:** `api/Storage.ts` - Abstracts IPC calls via `window.BridgeIPC`
- **State Management (Pinia):**
  - `stores/tasks.store.ts` - Day/task data and operations
  - `stores/tags.store.ts` - Tag management
  - `stores/branches.store.ts` - Branch/project management
  - `stores/settings.store.ts` - App preferences
  - `stores/storage.store.ts` - Sync status and orchestration (listens to main process events)
  - `stores/theme.store.ts`, `stores/ui.store.ts` - UI state
  - `stores/taskEditor.store.ts` - Task creation/editing modal
  - `stores/filter.store.ts` - Task filtering
  - `stores/deletedTasks.store.ts` - Soft-deleted task management and recovery
  - `stores/update.store.ts` - App update state
  - `stores/ai/ai.store.ts` - Main AI state
  - `stores/ai/localModel.store.ts` - Local model lifecycle
  - `stores/ai/remoteModel.store.ts` - Remote provider state
- **Router:** `router/index.ts` - Hash-based routing (Main, Settings, Assistant)
- **Composables:** `composables/` - Reusable Vue composition functions (drag & drop, search, clipboard, CodeMirror, etc.)
- **UI:** `ui/` - Components organized as base, common, modules, and views

**3. Shared Code** (`src/shared/`)

- `types/storage.ts` - Domain models (Task, Day, Tag, Branch, File, Settings)
- `types/ipc.ts` - IPC contract (BridgeIPC interface)
- `types/ai.ts` - AI configuration and runtime types
- `types/search.ts` - Search result types
- `types/update.ts` - Update state types
- `types/common.ts` - Base types (ID, ISODate, ISODateTime, etc.)
- `utils/` - Date/time helpers, array utilities, FP utilities, common functions
- `constants/` - Shared constants (shortcuts, storage, theme palette)

### IPC Communication Pattern

All renderer ↔ main communication flows through **`window.BridgeIPC`** (exposed via `preload.ts` + contextBridge):

**Request-Response Pattern:**

```typescript
// Renderer: Call IPC method
await window.BridgeIPC["tasks:create"](newTask)

// Main: Handler registered in setup/ipc/
ipcMain.handle("create-task", (e, task) => storage?.createTask(task))
```

**Event Broadcasting Pattern:**

```typescript
// Main: Broadcast to renderer
mainWindow.webContents.send("storage-sync:status-changed", status)

// Renderer: Listen in store
window.BridgeIPC["storage-sync:on-status-changed"]((status) => {...})
```

**IPC Channel Categories:**

- **Storage:** `tasks:*`, `days:*` - Task/day CRUD operations
- **Branches:** `branches:*` - Branch/project management
- **Tags:** `tags:*` - Tag management
- **Settings:** `settings:*` - Preferences load/save
- **Files:** `files:*` - File attachment operations
- **Search:** `search:query` - Full-text task search
- **AI:** `ai:*` - AI assistant operations (send message, check connection, model management)
- **Updates:** `updates:*` - App update lifecycle (check, download, install)
- **Sync:** `storage-sync:activate`, `storage-sync:deactivate`, `storage-sync:sync`, `storage-sync:get-status`
- **Events:** `storage-sync:on-status-changed`, `storage-sync:on-data-changed`, `ai:on-local-state-changed`, `ai:on-local-download-progress`, `updates:on-state-changed`
- **Shortcuts:** `shortcut:tasks:create`, `shortcut:ui:open-search-panel`, `shortcut:ui:open-assistant-panel`, `shortcut:ui:open-settings-panel`, `shortcut:ui:toggle-tasks-view-mode`

### Data Flow Architecture

**Complete Request Flow (e.g., Create Task):**

```
Component (Vue)
    ↓ calls store action
TasksStore.createTask()
    ↓ uses API wrapper
StorageAPI.createTask() → window.BridgeIPC["tasks:create"]()
    ↓ IPC bridge
Main Process ipcMain.handle("create-task")
    ↓ delegates to
StorageController.createTask()
    ↓ calls service
TasksService.createTask() (enriches with tag objects)
    ↓ calls model
TaskModel.createTask() → SQLite INSERT
    ↓ returns enriched task
Promise resolves → Store updates state → Component re-renders
```

### Database & Storage

**SQLite Setup (better-sqlite3):**

- **Location:** `~/Library/Application Support/Daily/db/daily.sqlite`
- **Schema Migrations:** Versioned SQL migrations in `storage/database/migrations/`
- **Tables:** `branches`, `tags`, `tasks`, `task_tags`, `files`, `task_attachments`, `settings`
- **Row Mapping:** `_rowMappers.ts` handles SQL snake_case ↔ domain camelCase conversion
- **Soft Deletes:** `deleted_at` column marks deleted records; filtered via `WHERE deleted_at IS NULL`
- **Default Branch:** `main` branch auto-created on initial migration

**Key Indexes:**

- `idx_tasks_branch_date` - Branch + date filtering (partial: non-deleted only)
- `idx_tasks_date` - Date-based queries (partial: non-deleted only)
- `idx_tasks_status` - Status filtering (partial: non-deleted only)
- `idx_tasks_deleted` - Soft-deleted task queries (partial: deleted only)
- `idx_tags_active` - Active tags (partial: non-deleted only)

**Task Ordering:**

- Tasks use `order_index REAL` for manual sorting
- Supports drag & drop reordering and cross-status moves

**Synchronization:**

- **Engine:** `SyncEngine.ts` with Local/Remote adapters
- **Strategy:** Last-Write-Wins (LWW) based on `updatedAt` timestamps
- **Modes:** Pull (remote wins on tie), Push (local wins on tie)
- **Auto-Sync:** 5-minute interval when enabled
- **Snapshot-Based:** Compares local vs remote snapshots, merges, and pushes if different

### State Management Pattern

**Store Responsibilities:**

1. **tasksStore** - Maintains `days[]` array of Day objects, handles CRUD, provides computed `activeDayInfo`
2. **tagsStore** - Maintains `tags[]` array, provides tag list across app
3. **branchesStore** - Manages project branches, active branch selection
4. **settingsStore** - Settings with in-memory cache, deep merge for partial updates
5. **storageStore** - Bridges main/renderer for sync status, listens to `storage-sync:*` events, triggers revalidation
6. **deletedTasksStore** - Soft-deleted task listing, restore, and permanent deletion
7. **updateStore** - App update state (check, download, install)
8. **aiStore** - AI assistant state, message sending, connection management
9. **filterStore** - Task filtering by tags, status, etc.

**Sync Status Broadcasting:**

1. Main process performs sync (pull/push)
2. Main sends `storage-sync:status-changed` event
3. `storageStore` listens and updates `status` state
4. If data changed, main sends `storage-sync:data-changed`
5. `storageStore` calls `revalidate()` on all stores
6. UI shows sync success toast

---

## Key Architectural Patterns

### 1. Local-First Data Synchronization

- SQLite is always the source of truth
- Remote storage (iCloud) acts as a "flash drive" for snapshots
- Automatic conflict resolution with LWW strategy
- Pull/push modes handle timestamp ties differently

### 2. Service-Oriented Data Access

- **Models:** Low-level SQLite CRUD with row mapping
- **Services:** Business logic (e.g., TasksService enriches tasks with full tag objects)
- **Controller:** Orchestration and IPC exposure
- **API Layer:** Simple async wrappers for renderer

### 3. Branch-Based Project Isolation

- Tasks are scoped to branches via `branchId`
- Default `main` branch always exists
- Active branch stored in settings (`branch.activeId`)
- Branch switching filters all task queries

### 4. Soft Deletes with Recovery

- Records marked with `deletedAt` instead of hard delete
- Synced like normal documents for cross-device consistency
- Filtered out at query time via partial indexes
- Dedicated UI for viewing, restoring, and permanently deleting tasks

### 5. Type Safety Across Boundaries

- Shared types in `src/shared/types/` prevent IPC mismatches
- `BridgeIPC` interface enforces preload script contract
- TypeScript strict mode throughout

### 6. Multi-Window Coordination

- **Main Window:** Primary task management UI
- **Splash Window:** Loading screen (auto-dismissed)
- **About Window:** App information
- **Settings Window:** App preferences
- **Assistant Window:** AI chat interface
- Window state managed in main process, coordinated via IPC events

---

## Important Initialization Sequence

1. Electron App Ready (`app.whenReady()`)
2. Show Splash Screen
3. **Initialize Storage** (`StorageController.init()`)
   - Connect to SQLite at `~/Library/Application Support/Daily/db/daily.sqlite`
   - Run pending migrations
   - Load settings into memory cache
4. **Initialize AI** (`AIController.init()`)
5. Cleanup orphan files
6. Setup Security (CSP, protocols, preload)
7. Setup IPC Handlers (all channels registered)
8. Setup Sync Engine (register callbacks for status/data changes)
9. Setup Update Manager
10. Create Main Window (loads Vue renderer)
11. Hide Splash, Show Main
12. Auto-enable Sync (if previously enabled in settings)

---

## File Path Aliases

Configured in `electron.vite.config.ts` and respective `tsconfig.json` files:

- **Main Process:** `@` → `src/main/`, `@shared` → `src/shared/`
- **Renderer Process:** `@` → `src/renderer/src/`, `@shared` → `src/shared/`
- **Preload Script:** `@` → `src/main/`, `@shared` → `src/shared/`

---

## Security Architecture

- **Context Isolation:** Main/renderer processes completely isolated (nodeIntegration: false)
- **BridgeIPC Only:** No direct fs/electron access from renderer
- **CSP:** Script sources restricted to 'self'
- **Safe File Protocol:** Custom `daily://` protocol for reading files only from app data directory
- **Single Instance:** Lock prevents multiple app instances

---

## Key Constraints & Considerations

- **macOS Only:** Built for macOS, not tested on Windows/Linux
- **Node/npm/pnpm Versions:** See `engines` in package.json (Node >=22.5.0, pnpm >=10.12.1)
- **Electron IPC Limits:** Keep payloads under 100MB
- **File Attachments:** Stored as filesystem files, tracked via `files` and `task_attachments` tables
- **Settings Cache:** In-memory cache invalidated on external data changes
- **Soft Deletes:** Never hard-delete documents; always use `deletedAt` timestamp
- **Branch Scope:** Tasks always belong to a branch; default is `main`

---

## Critical Files Reference

**Main Process Entry Points:**

- `src/main/app.ts` - Electron app lifecycle
- `src/main/windows.ts` - Window management
- `src/main/preload.ts` - BridgeIPC exposure
- `src/main/config.ts` - App configuration constants

**Main Process Orchestrators:**

- `src/main/storage/StorageController.ts` - Central data facade
- `src/main/storage/sync/SyncEngine.ts` - Sync orchestration
- `src/main/ai/AIController.ts` - AI assistant orchestration
- `src/main/updates/UpdaterController.ts` - Auto-update management

**Database:**

- `src/main/storage/database/instance.ts` - SQLite initialization
- `src/main/storage/database/migrations/` - Schema migrations

**Renderer Entry Points:**

- `src/renderer/src/main.ts` - Vue app initialization
- `src/renderer/src/api/Storage.ts` - IPC abstraction layer

**Renderer State:**

- `src/renderer/src/stores/tasks.store.ts` - Main task state
- `src/renderer/src/stores/branches.store.ts` - Branch/project state
- `src/renderer/src/stores/storage.store.ts` - Sync coordination
- `src/renderer/src/stores/ai/ai.store.ts` - AI assistant state

**Shared Contracts:**

- `src/shared/types/storage.ts` - Domain models
- `src/shared/types/ipc.ts` - BridgeIPC interface
- `src/shared/types/ai.ts` - AI types
