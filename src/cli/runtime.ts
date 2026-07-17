import {createStorageCore} from "@/storage/createStorageCore"
import {closeDatabase, initDatabase} from "@/storage/database/instance"
import {FolderRemoteAdapter} from "@/storage/sync/adapters/FolderRemoteAdapter"
import {SyncEngine} from "@/storage/sync/SyncEngine"
import {CliController} from "./CliController"
import {resolveCliRuntime} from "./config"
import {exitCodeFor, renderJsonError} from "./output"

import type {StorageCore} from "@/storage/createStorageCore"
import type {SyncStrategy} from "@/types/sync"
import type {CliRuntime} from "./config"

/**
 * Runs one command action with uniform failure handling: executes `run` against
 * an open storage session; on a handled failure prints the message (or the JSON
 * error envelope with --json) to stderr and exits with the CliError exit code.
 */
export async function runCliCommand(opts: {json?: boolean; sync?: boolean}, run: (cli: CliController) => Promise<void>): Promise<void> {
  try {
    await withCliStorage(opts, run)
  } catch (err) {
    reportFailureAndExit(opts, err)
  }
}

/**
 * Same failure handling as runCliCommand, but hands the raw StorageCore and the
 * resolved runtime to `run` — for commands that manage sync itself.
 */
export async function runCliCoreCommand(opts: {json?: boolean}, run: (core: StorageCore, runtime: CliRuntime) => Promise<void>): Promise<void> {
  try {
    const runtime = resolveCliRuntime()
    const db = initDatabase(runtime.paths.dbPath())
    const core = createStorageCore(db, runtime.paths)
    try {
      await run(core, runtime)
    } finally {
      closeDatabase()
    }
  } catch (err) {
    reportFailureAndExit(opts, err)
  }
}

/**
 * Opens the storage the resolved mode points at (direct: the app's DB; node:
 * the CLI's own DB), runs `fn`, and always closes the DB. In node mode a pull
 * runs before `fn` and a push after it if `fn` mutated — both best-effort:
 * a sync failure warns on stderr and the command proceeds/succeeds.
 * Pass `sync: false` (commander's --no-sync) to skip both.
 */
export async function withCliStorage<T>(opts: {sync?: boolean}, fn: (cli: CliController) => Promise<T>): Promise<T> {
  const runtime = resolveCliRuntime()
  const db = initDatabase(runtime.paths.dbPath())
  const core = createStorageCore(db, runtime.paths)
  const cli = new CliController(core, runtime.paths)
  const engine = opts.sync !== false && runtime.mode === "node" ? createNodeSyncEngine(core, runtime) : null

  try {
    if (engine) await syncBestEffort(engine, "pull")
    const result = await fn(cli)
    if (engine && cli.didMutate) await syncBestEffort(engine, "push")
    return result
  } finally {
    closeDatabase()
  }
}

/** Builds the node-mode sync engine over the configured sync folder. */
export function createNodeSyncEngine(core: StorageCore, runtime: CliRuntime): SyncEngine {
  return new SyncEngine(core.localAdapter, [{id: "folder", label: "Sync folder", adapter: new FolderRemoteAdapter(runtime.syncDir!)}], {
    assetsDir: () => runtime.paths.assetsDir(),
    onStatusChange: () => {},
    onDataChanged: () => {},
  })
}

async function syncBestEffort(engine: SyncEngine, strategy: SyncStrategy): Promise<void> {
  try {
    await engine.syncOnce(strategy)
  } catch (err) {
    console.error(`Warning: sync failed (${err instanceof Error ? err.message : String(err)}); changes stay local`)
  }
}

function reportFailureAndExit(opts: {json?: boolean}, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "ERROR"
  if (opts.json) console.error(renderJsonError(code, message))
  else console.error(message)
  process.exit(exitCodeFor(err))
}
