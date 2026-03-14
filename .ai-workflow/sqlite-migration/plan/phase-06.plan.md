---
phase: 06
name: NSFileCoordinator Native Binding
feature_slug: sqlite-migration
design: .ai-workflow/sqlite-migration/design/
status: pending
---

# Phase 06: NSFileCoordinator Native Binding

## 1. Goal

Integrate a native macOS `NSFileCoordinator` binding for safe concurrent access to iCloud Drive files. Wrap all RemoteStorageAdapter read/write operations in coordinated access to prevent data corruption from iCloud upload/download races. After this phase, snapshot read/write and asset sync are protected by macOS file coordination APIs.

## 2. Context

### Current State Analysis

After Phase 5, RemoteStorageAdapter uses atomic write (temp+rename) and retry with backoff, which provides basic protection. However, without `NSFileCoordinator`, there are still edge cases:

- If iCloud is actively uploading `snapshot.v2.json`, `fs.readFile` may get a partial file
- `fs.rename` is atomic on APFS but doesn't coordinate with iCloud's download/upload daemon
- `.icloud` placeholder detection (Phase 5) helps but can't initiate downloads

**From design/01-architecture.md:** "Full `NSFileCoordinator` deferred to future epic" was the original fallback, but the open question resolution mandates native binding in this migration.

### Architecture Context

`NSFileCoordinator` is Apple's API for coordinating file access between processes (including the iCloud daemon). It ensures:

- Reads don't occur during partial writes by another process
- Writes are coordinated with iCloud upload scheduling
- File presence can be requested via `NSFileManager.startDownloadingUbiquitousItem`

**Implementation options:**

1. `@aspect-build/napi-file-coordinator` — if available as npm package
2. Custom N-API native addon — small C++/Objective-C module
3. `child_process` calling a small Swift CLI tool

### Key Discoveries

- The existing `afterPack-mac.js` handles native module code signing generically (`codesign --deep`)
- `electron-builder` with `postinstall: "electron-builder install-app-deps"` rebuilds native modules
- The app only runs on macOS (arm64) — no cross-platform concern
- RemoteStorageAdapter already has all read/write operations centralized

### Desired End State

- A file coordination module that wraps `NSFileCoordinator` for read and write operations
- RemoteStorageAdapter uses coordinated read/write for all iCloud file operations
- Can request file download for evicted `.icloud` stubs
- All iCloud operations are safe against concurrent access by the iCloud daemon
- Graceful fallback if native module is unavailable (use non-coordinated I/O)

## 3. Files to Create or Modify

| File                                                     | Action | Why                                                    |
| -------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `src/main/native/file-coordinator.swift`                 | create | Swift CLI for NSFileCoordinator                        |
| `scripts/build-file-coordinator.sh`                      | create | Build script for Swift CLI                             |
| `src/main/utils/fileCoordinator.ts`                      | create | TypeScript wrapper calling Swift CLI via child_process |
| `src/main/storage/sync/adapters/RemoteStorageAdapter.ts` | modify | Use coordinated read/write for all iCloud operations   |
| `electron-builder.json`                                  | modify | Add `resources/file-coordinator` to `extraResources`   |

## 4. Implementation Approach

The chosen approach is **Swift CLI bridge via `child_process`**. This avoids N-API/Objective-C++ build complexity, works reliably with Electron packaging, and requires no additional npm dependencies. A small Swift CLI tool is compiled during build and bundled with the app.

1. **Create Swift CLI tool**
   - What to do: Create `src/main/native/file-coordinator.swift` — a Swift command-line tool that accepts subcommands:
     - `read <path>` — wraps `NSFileCoordinator` read, outputs file contents to stdout. Exit code 0 on success, 1 on error (message to stderr).
     - `write <path>` — wraps `NSFileCoordinator` write, reads data from stdin, writes to temp file (`<path>.tmp`) then renames to `<path>`. Exit code 0 on success.
     - `download <path>` — calls `NSFileManager.default.startDownloadingUbiquitousItem(at:)`. Exit code 0 if initiated, 1 if already present or error.
     - `is-stub <path>` — checks if path matches `.icloud` stub pattern (filename starts with `.` and ends with `.icloud`). Outputs `true` or `false` to stdout.
   - Add a build script `scripts/build-file-coordinator.sh` that compiles: `swiftc -O -o resources/file-coordinator src/main/native/file-coordinator.swift`
   - Add `"prebuild": "bash scripts/build-file-coordinator.sh"` to `package.json` scripts so the Swift binary is compiled before `electron-builder` runs.
   - Add `resources/file-coordinator` to `electron-builder.json` `extraResources` array so it's bundled with the app.
   - Acceptance check: `swiftc` compiles the tool. `./resources/file-coordinator read /tmp/test.txt` works on macOS. Binary is under 1MB.

2. **Create file coordinator TypeScript module**
   - What to do: Create `src/main/utils/fileCoordinator.ts` with:
     - `const COORDINATOR_PATH` — resolves via: `app.isPackaged ? path.join(process.resourcesPath, 'file-coordinator') : path.join(process.cwd(), 'resources', 'file-coordinator')`. In dev, `process.cwd()` is the project root where `resources/` lives.
     - `coordinatedRead(filePath: string): Promise<Buffer | null>` — `execFile(COORDINATOR_PATH, ['read', filePath])`, returns stdout as Buffer. On error: log warning, fallback to `fs.readFile(filePath)`.
     - `coordinatedWrite(filePath: string, data: Buffer): Promise<void>` — spawn `COORDINATOR_PATH write <filePath>`, pipe `data` to stdin. On error: log warning, fallback to write-to-`${filePath}.tmp`-then-`fs.rename`.
     - `isICloudStub(filePath: string): boolean` — pure TypeScript check: `path.basename(filePath).startsWith('.') && filePath.endsWith('.icloud')`. No CLI call needed.
     - `requestDownload(filePath: string): Promise<void>` — `execFile(COORDINATOR_PATH, ['download', filePath])`. Timeout: 30 seconds. On timeout or error: log warning, do not throw (caller will retry on next sync cycle).
     - Graceful fallback: wrap `execFile` in try/catch. If the binary is not found (ENOENT), log `"File coordinator binary not found, using uncoordinated I/O"` once, then use `fs.readFile`/`fs.writeFile` for all subsequent calls.
   - Acceptance check: `pnpm typecheck:main` passes. All 4 functions exported. Fallback path tested by renaming binary temporarily.

3. **Integrate into RemoteStorageAdapter**
   - What to do: In `src/main/storage/sync/adapters/RemoteStorageAdapter.ts`:
     - In `loadSnapshot()` method: replace `fs.readFile(snapshotPath)` with `coordinatedRead(snapshotPath)`.
     - In `saveSnapshot()` method: replace the temp+rename pattern with `coordinatedWrite(snapshotPath, data)` (the Swift CLI handles temp+rename internally within the coordination block).
     - In `syncAssets()` method: use `coordinatedRead` for reading remote asset files and `coordinatedWrite` for writing remote asset files. Local asset files (in `assetsDir`) don't need coordination — only iCloud Drive paths do.
     - Before retry in `loadSnapshot()`: if `isICloudStub(snapshotPath)`, call `requestDownload(snapshotPath)` before retrying.
   - Acceptance check: `grep "coordinatedRead\|coordinatedWrite" src/main/storage/sync/adapters/RemoteStorageAdapter.ts` returns matches. No direct `fs.readFile`/`fs.writeFile` on iCloud paths.

4. **Verify build and signing**
   - What to do: Run `pnpm build`. Verify `resources/file-coordinator` binary is in the built `.app` bundle under `Contents/Resources/`. The existing `afterPack-mac.js` with `codesign --deep` will sign the Swift binary. Verify the app launches and the coordinator binary is accessible at `process.resourcesPath`.
   - Acceptance check: `pnpm build` succeeds. Built app contains `file-coordinator` in Resources. App launches without errors.

## 5. Embedded Contracts

### File Coordinator Module (`src/main/utils/fileCoordinator.ts`)

```typescript
import {execFile} from "child_process"
import path from "path"

/**
 * Coordinated file read for iCloud Drive.
 * Calls Swift CLI: `file-coordinator read <filePath>`
 * Falls back to fs.readFile if binary not found.
 * Returns null if file does not exist (ENOENT).
 */
export async function coordinatedRead(filePath: string): Promise<Buffer | null>

/**
 * Coordinated file write for iCloud Drive.
 * Calls Swift CLI: `file-coordinator write <filePath>` with data piped to stdin.
 * Swift CLI writes to `<filePath>.tmp` then renames to `<filePath>` inside NSFileCoordinator block.
 * Falls back to: fs.writeFile(`${filePath}.tmp`) + fs.rename to `${filePath}`.
 */
export async function coordinatedWrite(filePath: string, data: Buffer): Promise<void>

/**
 * Check if path points to an .icloud placeholder stub.
 * Pure TypeScript — no CLI call.
 * Pattern: basename starts with "." and ends with ".icloud"
 */
export function isICloudStub(filePath: string): boolean

/**
 * Initiate iCloud download for a stub file.
 * Calls Swift CLI: `file-coordinator download <filePath>`
 * Timeout: 30000ms. On timeout or error: logs warning, does NOT throw.
 * Caller is responsible for retrying the read on the next sync cycle.
 */
export async function requestDownload(filePath: string): Promise<void>
```

### Swift CLI Interface (`src/main/native/file-coordinator.swift`)

```
Usage: file-coordinator <subcommand> <path>

Subcommands:
  read <path>      Read file within NSFileCoordinator. Output to stdout. Exit 0/1.
  write <path>     Write stdin to file within NSFileCoordinator (temp+rename). Exit 0/1.
  download <path>  Call startDownloadingUbiquitousItem. Exit 0/1.
  is-stub <path>   Output "true" or "false". Exit 0.
```

## 6. Validation Gates

### Automated

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck:main` passes
- [ ] `pnpm build` succeeds
- [ ] `grep -c "coordinatedRead\|coordinatedWrite\|isICloudStub\|requestDownload" src/main/utils/fileCoordinator.ts` returns 4 (all 4 functions present)
- [ ] `grep "coordinatedRead\|coordinatedWrite" src/main/storage/sync/adapters/RemoteStorageAdapter.ts` returns matches
- [ ] `test -f resources/file-coordinator` — Swift binary exists after build script runs
- [ ] Built `.app` bundle contains `file-coordinator` in `Contents/Resources/`

### Manual

- [ ] App launches on arm64 Mac with native coordinator loaded
- [ ] iCloud sync still works end-to-end
- [ ] Simulate evicted file (`.icloud` stub) — app recovers and downloads
- [ ] Concurrent sync operations don't corrupt snapshot

## Scope Boundary

This phase does NOT:

- Remove PouchDB or clean up dead code (Phase 7)
- Change database schema, models, or services
- Modify sync logic — only wraps existing I/O with coordination

After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.
