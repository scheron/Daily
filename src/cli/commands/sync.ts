import {resolve} from "node:path"

import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

import {FolderRemoteAdapter} from "@/storage/sync/adapters/FolderRemoteAdapter"
import {defaultSyncDir, loadCliConfig, resolveCliRuntime, saveCliConfig} from "../config"
import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {renderJsonOk} from "../output"
import {createNodeSyncEngine, runCliCoreCommand} from "../runtime"
import {runSyncDoctor} from "./sync.doctor"
import {SYNC_DISABLE_HELP, SYNC_DOCTOR_HELP, SYNC_ENABLE_HELP, SYNC_HELP, SYNC_STATUS_HELP} from "./sync.help"

import type {Command} from "commander"

type SyncOptions = {json?: boolean}
type SyncEnableOptions = SyncOptions & {dir?: string}

export function registerSyncCommands(program: Command): void {
  const sync = program.command("sync").description("Sync the node database with the configured folder").option("--json", "output stable JSON")
  sync.action((opts, command) => runSyncNow(readOptions(opts, command)))
  addHelpDetails(sync, SYNC_HELP)

  addHelpDetails(
    sync
      .command("enable")
      .description("Enable node mode (own database synced through a folder)")
      .option("--dir <path>", "sync folder (default ~/.local/share/daily/sync)")
      .option("--json", "output stable JSON"),
    SYNC_ENABLE_HELP,
  ).action((opts, command) => runSyncEnable(readOptions(opts, command)))

  addHelpDetails(
    sync.command("disable").description("Disable node mode, return to the app database").option("--json", "output stable JSON"),
    SYNC_DISABLE_HELP,
  ).action((opts, command) => runSyncDisable(readOptions(opts, command)))

  addHelpDetails(
    sync.command("status").description("Show sync mode, folder, and snapshot info").option("--json", "output stable JSON"),
    SYNC_STATUS_HELP,
  ).action((opts, command) => runSyncStatus(readOptions(opts, command)))

  addHelpDetails(
    sync.command("doctor").description("Diagnose node sync-folder configuration without changing data").option("--json", "output stable JSON"),
    SYNC_DOCTOR_HELP,
  ).action((opts, command) => runSyncDoctor(readOptions(opts, command)))
}

function runSyncNow(opts: SyncOptions): Promise<void> {
  return runCliCoreCommand(opts, async (core, runtime) => {
    if (runtime.mode !== "node") {
      throw new CliError(CliErrorCode.SYNC_NOT_CONFIGURED, "Sync is not configured. Run: daily sync enable [--dir <path>]")
    }

    try {
      await createNodeSyncEngine(core, runtime).syncOnce("pull")
    } catch (err) {
      throw new CliError(CliErrorCode.SYNC_FAILED, `Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (opts.json) console.log(renderJsonOk({synced: true, dir: runtime.syncDir}))
    else console.log(`Synced with ${runtime.syncDir}`)
  })
}

function runSyncEnable(opts: SyncEnableOptions): void {
  const dir = resolve(opts.dir ?? defaultSyncDir())
  saveCliConfig({...loadCliConfig(), sync: {dir}})

  if (opts.json) console.log(renderJsonOk({mode: "node", dir}))
  else console.log(`Node mode enabled. Sync folder: ${dir}`)
}

function runSyncDisable(opts: SyncOptions): void {
  const config = loadCliConfig()
  delete config.sync
  saveCliConfig(config)

  if (opts.json) console.log(renderJsonOk({mode: "direct"}))
  else console.log("Node mode disabled. Using the app database.")
}

async function runSyncStatus(opts: SyncOptions): Promise<void> {
  const runtime = resolveCliRuntime()
  const snapshot = runtime.mode === "node" ? await new FolderRemoteAdapter(runtime.syncDir!).loadSnapshot() : null
  const meta = snapshot ? {updatedAt: snapshot.meta.updatedAt, hash: snapshot.meta.hash} : null

  if (opts.json) {
    console.log(renderJsonOk({mode: runtime.mode, dir: runtime.syncDir, snapshot: meta}))
    return
  }

  if (runtime.mode === "direct") {
    console.log("Mode: direct (app database)")
    return
  }

  console.log(`Mode: node\nSync folder: ${runtime.syncDir}\nSnapshot: ${meta ? `${meta.updatedAt} (${meta.hash.slice(0, 12)})` : "none yet"}`)
}
