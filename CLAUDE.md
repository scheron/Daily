# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Daily is an Electron + Vue 3 task management application with local-first data storage. It features:

- Day-centric task organization with markdown support
- SQLite (better-sqlite3) for local storage with iCloud synchronization
- Branch-based project isolation (multi-project support)
- Built-in AI assistant with streaming chat, durable conversations, tool-call confirmations, and a structured agent loop (remote OpenAI-compatible APIs + local llama.cpp models)
- Full-text search across tasks
- Multi-window architecture (main app, settings, assistant, about)
- Three-layer architecture: Electron main process, Vue 3 renderer, and shared types

**Tech Stack:** Electron 36, Vue 3, TypeScript, Pinia, SQLite (better-sqlite3), TailwindCSS 4, Vite, llama.cpp for local AI

---

## Development Commands

### Core Commands

```bash
# Development
pnpm dev                    # Start dev server with hot reload

# Building
pnpm build                  # Build and package for macOS (.dmg in dist/)
pnpm build:compress         # electron-vite build only (no packaging)

# Type Checking (run all three before committing)
pnpm typecheck:main         # Check main process types
pnpm typecheck:render       # Check renderer process types
pnpm typecheck:shared       # Check shared types
pnpm typecheck:all          # Run all three sequentially

# Code Quality
pnpm lint                   # ESLint with auto-fix
pnpm format                 # Prettier formatting
pnpm circular               # Check for circular dependencies (madge)
pnpm check:all              # Run lint + typecheck:all + circular + test
pnpm test                   # Run full vitest suite (Electron runtime)
```

### Release Commands

```bash
# Interactive release (asks for version, opens editor for CHANGELOG)
pnpm release

# Non-interactive release (used by the release-daily skill)
pnpm release --version=0.15.0 --changelog-file=/tmp/section.md
```

The release script (`scripts/release.js`) bumps `package.json`, inserts the CHANGELOG section (replacing `## [Unreleased]` if present), commits `release: vX.Y.Z`, tags `vX.Y.Z`, and pushes both to origin. A GitHub Actions workflow then builds the .dmg, publishes the release, and triggers the homebrew-tap cask update.

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
  - `storage/models/` - Direct SQLite CRUD (TaskModel, TagModel, BranchModel, SettingsModel, FileModel, **AISessionModel** for AI sessions/turns/steps)
  - `storage/models/_rowMappers.ts` - SQL row ↔ domain object mapping
  - `storage/services/` - Business logic (TasksService, TagsService, BranchesService, DaysService, SettingsService, FilesService, SearchService)
  - `storage/search/` - Full-text search (SearchEngine, TaskSearchIndex)
  - `storage/sync/SyncEngine.ts` - Local-first sync with iCloud (LWW merge strategy)
- **AI Module:** `ai/` - AI assistant subsystem (see "AI Module" section below for details)
- **Updates:** `updates/UpdaterController.ts` - Auto-update management
- **IPC:** `setup/ipc/` - Handles inter-process communication via `ipcMain.handle()`
- **Utilities:** `utils/` - `AsyncMutex`, `logger`, file-coordinator helpers, etc.

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
  - `stores/ai/ai.store.ts` - Main AI state (messages, streaming, durable sessions, confirmations)
  - `stores/ai/localModel.store.ts` - Local model lifecycle (download, install, activate)
  - `stores/ai/remoteModel.store.ts` - Remote provider state
- **Router:** `router/index.ts` - Hash-based routing (Main, Settings, Assistant)
- **Composables:** `composables/` - Reusable Vue composition functions (drag & drop, search, clipboard, CodeMirror, etc.)
- **UI:** `ui/` - Components organized as base, common, modules, and views
- **Chat rendering:** `ChatMarkdown` component uses `markdown-it` + `highlight.js` for assistant replies; `MessageReasoning` collapsible panel renders the reasoning stream with a timing badge; `ToolCallCard` shows running/done tool calls.

**3. Shared Code** (`src/shared/`)

- `types/storage.ts` - Domain models (Task, Day, Tag, Branch, File, Settings)
- `types/ipc.ts` - IPC contract (`BridgeIPC` interface)
- `types/ai.ts` - AI configuration and runtime types (`MessageLLM`, `Tool`, `AgentTurnSnapshot`, streaming types, etc.)
- `types/search.ts` - Search result types
- `types/update.ts` - Update state types
- `types/common.ts` - Base types (ID, ISODate, ISODateTime, etc.)
- `errors/` - **All error classes and error codes for the project** (see "Errors" section below)
- `utils/` - Date/time helpers, array utilities, FP utilities, common functions
- `constants/` - Shared constants (shortcuts, storage, theme palette)

### AI Module (`src/main/ai/`)

The AI subsystem is structured as a layered agent loop with hooks, durable session persistence, live event streaming, and conversation compaction.

- `AIController.ts` - Orchestrates the entire AI flow: chat dispatch, agent iteration loop, tool execution, policy/confirmation handling, idle-unload of local models, model lifecycle.
- `clients/`
  - `common/OpenAiCompatibleClient.ts` - Abstract base for OpenAI-compatible providers (handles both remote APIs and the local llama-server, which exposes the same protocol).
  - `common/streaming/` - Streaming protocol: `ChatStreamAccumulator` (unified delta protocol), `sseParser` (chunk-boundary-safe SSE), `thinkBlockSplitter` (`<think>` tag extraction).
  - `remote/OpenAiClient.ts` - Remote provider client (DeepSeek, OpenAI, Groq, etc.)
  - `local/LocalClient.ts` - Local llama.cpp client; spawns and manages a llama-server subprocess.
  - `local/core/LlamaServer.ts` - Subprocess lifecycle, binary download/extraction with sha256 verification, health checks.
  - `local/core/LocalModelService.ts` - Model catalog (`resources/models.json`), download lifecycle (resumable via Range header), sha256 verification, orphan cleanup, idle auto-unload.
  - `local/core/catalog.ts` + `manifest.ts` - JSON catalog loader with schema validation; model manifest types.
- `hooks/HookChain.ts` - Composable agent runtime hooks (`BeforeToolCall`, `AfterToolCall`, `TransformContext`).
- `memory/ConversationCompactor.ts` - Truncates conversation history into a deterministic summary once it exceeds a turn threshold, preserving safe message boundaries (tool-call sequences stay intact).
- `memory/deterministicSummary.ts` - Pure functions that build the compaction summary from `AgentTurn[]`.
- `policy/policyHook.ts` - The `BeforeToolCall` hook that gates `isDestructive` tools behind explicit user confirmation.
- `policy/describeToolCall.ts` - Builds a one-line description of a tool call for the confirmation card.
- `turns/TurnBuilder.ts` - Structured turn tracking; each user message produces an `AgentTurn` with `AgentStep[]` (user, assistant, tool_call, tool_result, reasoning).
- `tools/ToolExecutor.ts` - Dispatches tool calls to the registry, returns `ToolResult`.
- `tools/registry/` - One file per tool, grouped under `categories/` (tasks, tags, projects, files, summary, meta). Each tool exports a `RegisteredTool` with `execute`, `isWrite`, `isDestructive`. The `respond` meta-tool is the only channel for user-visible assistant messages.
- `tools/compat.ts` - Compatibility-mode tool calling for OpenAI-compatible models that don't natively support function calls (Qwen 3.5 and similar fine-tunes); parses tool calls back out of plain content.
- `tools/format.ts` - Renders `ToolResult` as model-facing tool message + renderer-facing summary.
- `promts/` - System prompts (full, compact, tiny tiers — chosen by `PromptTier`).
- `utils/` - Pure helpers: `redact` (log redaction), `filterThinkBlocks`, `formatTask`/`formatTag`/`formatProject`/`formatDuration`/`getTodayDate` (LLM-facing formatters).

**Agent loop summary:** `sendMessage(text)` → restore history → `agentLoop`: call LLM → parse tool calls → run `BeforeToolCall` hooks (which can suspend on confirmation) → `ToolExecutor.execute` → run `AfterToolCall` hooks → append `tool_result` to history → repeat until `respond` is called or `maxIterations` reached → persist `AgentTurn` via `AISessionModel`.

### Errors (`src/shared/errors/`)

All error classes and error codes live here, grouped by domain. The convention:

- **Real Error classes** (something is `extends Error`, identity matters because callers catch with `instanceof`) → one file per class.
- **Inline throw codes** (semantic identifier that doesn't need its own class) → enum entries grouped by domain.

```
src/shared/errors/
├── index.ts                            (barrel for convenience imports)
├── ai/
│   ├── NonRetryableError.ts            (class, caught in OpenAI client)
│   ├── ServerStartCancelledError.ts    (class, caught in LocalClient/LlamaServer)
│   ├── LlamaServerErrorCode.ts         (enum)
│   ├── LocalModelErrorCode.ts          (enum)
│   └── OpenAiClientErrorCode.ts        (enum)
├── download/
│   └── DownloadErrorCode.ts            (enum)
└── sync/
    ├── RemoteSnapshotPendingError.ts   (class, caught in SyncEngine/RemoteAdapter)
    └── SyncErrorCode.ts                (enum)
```

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
window.BridgeIPC["storage-sync:on-status-changed"]((status) => {
  /* ... */
})
```

**IPC Channel Categories:**

- **Storage:** `tasks:*`, `days:*` - Task/day CRUD operations
- **Branches:** `branches:*` - Branch/project management
- **Tags:** `tags:*` - Tag management
- **Settings:** `settings:*` - Preferences load/save
- **Files:** `files:*` - File attachment operations
- **Search:** `search:query` - Full-text task search
- **AI:** `ai:*` - AI operations (`ai:send-message`, `ai:check-connection`, `ai:get-current-session`, `ai:clear-history`, `ai:cancel`, `ai:confirm-tool-call`, `ai:cancel-tool-call`, local-model management, etc.)
- **AI Events:** `ai:on-local-state-changed`, `ai:on-local-download-progress`, `ai:confirmation-required`, `ai:confirmation-resolved`, `ai:event` (live agent loop events — deltas, segment open/close, tool calls)
- **Updates:** `updates:*` - App update lifecycle (check, download, install)
- **Sync:** `storage-sync:activate`, `storage-sync:deactivate`, `storage-sync:sync`, `storage-sync:get-status`
- **Sync Events:** `storage-sync:on-status-changed`, `storage-sync:on-data-changed`
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
- **Tables:** `branches`, `tags`, `tasks`, `task_tags`, `files`, `task_attachments`, `settings`, **`ai_sessions`, `ai_turns`, `ai_steps`** (added in v004 migration for durable AI conversations)
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
- **iCloud handling:** `RemoteStorageAdapter` recognises iCloud placeholders and waits for download completion before treating a snapshot as missing.

### State Management Pattern

**Store Responsibilities:**

1. **tasksStore** - Maintains `days[]` array of Day objects, handles CRUD, provides computed `activeDayInfo`
2. **tagsStore** - Maintains `tags[]` array, provides tag list across app
3. **branchesStore** - Manages project branches, active branch selection
4. **settingsStore** - Settings with in-memory cache, deep merge for partial updates
5. **storageStore** - Bridges main/renderer for sync status, listens to `storage-sync:*` events, triggers revalidation
6. **deletedTasksStore** - Soft-deleted task listing, restore, and permanent deletion
7. **updateStore** - App update state (check, download, install)
8. **aiStore** - Streaming assistant state: message list with per-message `segments[]` (text/reasoning/tool_call), turn lifecycle, durable-session hydration, pending tool-call confirmations
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

### 7. AI Agent Loop with Hooks

- Each user message produces a structured `AgentTurn` with `AgentStep[]`
- Tool calls flow through a `HookChain` (`BeforeToolCall` → execute → `AfterToolCall`); destructive tools suspend on user confirmation
- Conversation history is persisted to SQLite (`ai_sessions`/`ai_turns`/`ai_steps`) and restored on app start
- `ConversationCompactor` summarises older turns once the history grows past a threshold, preserving tool-call boundaries
- Live `AIEvent`s (delta, segment_open, segment_close, tool_call_running, tool_call_done) stream from main to renderer for real-time UI updates

---

## Coding Conventions

These conventions are enforced project-wide.

### Public-before-private

In every class body, public methods come first, private methods last. In every file, exported functions/constants come first, non-exported helpers last. The reading order is "what this code offers" → "how it does it internally". Constructor stays at the conventional spot just after fields.

### Errors live in `shared/errors/`

Every named `Error` subclass and every semantically distinct inline throw code lives under `src/shared/errors/<domain>/`, grouped by domain (`ai/`, `download/`, `sync/`). One class per file. Inline throws use enum codes from those folders. See the "Errors" section above for the full layout.

### `type` over `interface`

Use `type` aliases by default. Reserve `interface` for shapes that are actually implemented by a class (e.g. `IAiClient`, `ILocalModelService`).

### Pure functions in `utils/`

Pure helpers go in `utils/` folders (`src/main/ai/utils/`, `src/shared/utils/<area>/`, etc.). If the helper is used across the main/renderer boundary, lift it to `src/shared/utils/`. Domain-coupled pure functions can stay near the domain as long as they live in their own one-purpose file.

### Locality of types and constants

Types and constants live at the narrowest scope that covers all their use sites. A type used only inside one module stays there; one used by a controller and two siblings lifts to the module root; one used across the main/renderer boundary lifts to `src/shared/types/`. Errors are the exception — they always live in `src/shared/errors/`.

### CHANGELOG format

CHANGELOG entries are App Store-style product notes — type-based sections, impersonal voice, no `your` / `you`. See `.claude/skills/release-daily/references/voice.md` for the full convention. Sections in order: `💥 Breaking Changes`, `✨ New Features`, `🎨 Improvements`, `🐛 Bug Fixes`, `⚡ Performance`, `🔒 Security`. Skip sections that have no entries.

---

## Important Initialization Sequence

1. Electron App Ready (`app.whenReady()`)
2. Show Splash Screen
3. **Initialize Storage** (`StorageController.init()`)
   - Connect to SQLite at `~/Library/Application Support/Daily/db/daily.sqlite`
   - Run pending migrations
   - Load settings into memory cache
4. **Initialize AI** (`AIController.init()`)
   - Initialize local model service (catalog load, orphan cleanup)
   - Register policy hook (destructive-tool confirmations)
   - Register compactor hook (`TransformContext`)
   - Restore last active session into in-memory conversation history
   - Start idle-check timer for local-model auto-unload
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
- **Tests:** `@main` → `src/main/`, `@shared` → `src/shared/`, `@renderer` → `src/renderer/src/`

---

## Security Architecture

- **Context Isolation:** Main/renderer processes completely isolated (`nodeIntegration: false`)
- **BridgeIPC Only:** No direct fs/electron access from renderer
- **CSP:** Script sources restricted to `'self'`
- **Safe File Protocol:** Custom `daily://` protocol for reading files only from app data directory
- **Single Instance:** Lock prevents multiple app instances
- **AI tool confirmations:** Every `isDestructive` tool call suspends in the policy hook until the user explicitly confirms or cancels via a UI card

---

## Build & Release

### Build configuration

- `electron-builder.json` produces an arm64 `.dmg` from `dist/`
- `asar: true` packs the renderer + node_modules into an asar archive
- `afterPack-mac.js` applies an ad-hoc codesign + entitlements (no Apple Developer ID required for local builds)
- `tailwindcss` and `@tailwindcss/vite` live in `devDependencies` — they're build-time tools, including them in `dependencies` bloats the asar with Rust natives (`@tailwindcss/oxide`, `lightningcss`) that the production app doesn't need

### Release script (`scripts/release.js`)

Supports both interactive and non-interactive modes:

| Mode            | Trigger                                                 | Behaviour                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interactive     | `pnpm release` (no flags)                               | Prompts for version bump, opens `$EDITOR` on the new CHANGELOG section (pre-filled with `git log` output), asks to confirm.                                                                                       |
| Non-interactive | `pnpm release --version=X.Y.Z --changelog-file=path.md` | Reads the curated section from the file (with header auto-added if missing, trailing `---` separator auto-appended), inserts into `CHANGELOG.md` (replacing `## [Unreleased]` if present), commits, tags, pushes. |

In both modes the final steps are: `git commit -m "release: vX.Y.Z"` → `git tag vX.Y.Z` → push branch + tag to origin.

### GitHub Actions release workflow (`.github/workflows/release.yml`)

Triggers on `push: tags: v*`. Steps:

1. Pinned to `macos-14` runner (`macos-latest` rolls forward silently)
2. `actions/checkout@v5`, `actions/setup-node@v5`, `softprops/action-gh-release@v2` — current versions without Node-20 deprecation
3. `pnpm install --frozen-lockfile` — fails loud on lockfile drift
4. `pnpm run build` with `DEBUG=electron-builder` so the asar packing trace lands in the run log
5. **Verify `.dmg` step** — hard-fails if `dist/*.dmg` is missing (so silent electron-builder failures stop being silent)
6. Generate release notes from `CHANGELOG.md` via `scripts/release-notes.js`
7. Publish GitHub Release with `fail_on_unmatched_files: true`
8. Trigger the homebrew-tap repo's `update-cask` workflow via `repository_dispatch`

### `.claude/skills/release-daily/`

Project-local Claude skill that drafts CHANGELOG entries in the project's voice (Apple App Store-style product notes, impersonal pronouns, type-based sections) and invokes `pnpm release` non-interactively after user approval. The skill is checked into the repo following React's convention — `.claude/*.local.*` and `.claude/*.lock` are gitignored, the rest is tracked.

---

## Key Constraints & Considerations

- **macOS Only:** Built for macOS, not tested on Windows/Linux
- **Node/npm/pnpm Versions:** See `engines` in package.json (Node >=22.5.0, pnpm >=10.12.1)
- **Electron IPC Limits:** Keep payloads under 100MB
- **File Attachments:** Stored as filesystem files, tracked via `files` and `task_attachments` tables
- **Settings Cache:** In-memory cache invalidated on external data changes
- **Soft Deletes:** Never hard-delete documents; always use `deletedAt` timestamp
- **Branch Scope:** Tasks always belong to a branch; default is `main`
- **AI durable sessions:** Conversations persist across app restarts via `ai_sessions`/`ai_turns`/`ai_steps`; archive the active session via `ai:clear-history` (records stay in SQLite for recovery)
- **Local model RAM:** `unloadModel` setting controls automatic unload after idle (default 15m); manual unload via Settings UI
- **CI build cap:** macos-14 runner has limited RAM; large dep trees can push the asar packer past its budget. The `Verify .dmg was produced` step in the workflow catches silent failures loudly.

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
- `src/main/ai/AIController.ts` - AI assistant orchestration (streaming, hooks, sessions, idle-unload)
- `src/main/updates/UpdaterController.ts` - Auto-update management

**Database:**

- `src/main/storage/database/instance.ts` - SQLite initialization
- `src/main/storage/database/migrations/` - Schema migrations
- `src/main/storage/models/AISessionModel.ts` - AI sessions/turns/steps persistence

**Renderer Entry Points:**

- `src/renderer/src/main.ts` - Vue app initialization
- `src/renderer/src/api/Storage.ts` - IPC abstraction layer

**Renderer State:**

- `src/renderer/src/stores/tasks.store.ts` - Main task state
- `src/renderer/src/stores/branches.store.ts` - Branch/project state
- `src/renderer/src/stores/storage.store.ts` - Sync coordination
- `src/renderer/src/stores/ai/ai.store.ts` - AI assistant state (streaming, sessions, confirmations)

**Shared Contracts:**

- `src/shared/types/storage.ts` - Domain models
- `src/shared/types/ipc.ts` - BridgeIPC interface
- `src/shared/types/ai.ts` - AI types (streaming, turns, segments)
- `src/shared/errors/` - All error classes/codes grouped by domain

**Build & Release:**

- `scripts/release.js` - Release script (interactive + flag-driven non-interactive modes)
- `scripts/release-notes.js` - Extracts a version's CHANGELOG section for GitHub Release body
- `scripts/afterPack-mac.js` - Ad-hoc codesign + entitlements during electron-builder pack
- `.github/workflows/release.yml` - Tag-triggered build/publish workflow
- `.claude/skills/release-daily/` - CHANGELOG-drafting skill (project-local, in repo)
