import {cliPaths} from "@shared/config/paths"

import {createStorageCore} from "@/storage/createStorageCore"
import {closeDatabase, initDatabase} from "@/storage/database/instance"
import {CliController} from "./CliController"
import {exitCodeFor, renderJsonError} from "./output"

/**
 * Runs one command action with uniform failure handling: executes `run` against
 * an open storage session; on a handled failure prints the message (or the JSON
 * error envelope with --json) to stderr and exits with the CliError exit code.
 */
export async function runCliCommand(opts: {json?: boolean}, run: (cli: CliController) => Promise<void>): Promise<void> {
  try {
    await withCliStorage(run)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "ERROR"
    if (opts.json) console.error(renderJsonError(code, message))
    else console.error(message)
    process.exit(exitCodeFor(err))
  }
}

/** Opens the same SQLite DB the app uses, runs `fn`, and always closes the DB. Never starts auto-sync. */
async function withCliStorage<T>(fn: (cli: CliController) => Promise<T>): Promise<T> {
  const db = initDatabase(cliPaths.dbPath())
  const core = createStorageCore(db, cliPaths)
  const cli = new CliController(core, cliPaths)
  try {
    return await fn(cli)
  } finally {
    closeDatabase()
  }
}
