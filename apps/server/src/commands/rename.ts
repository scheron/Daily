import {resolveServerConfig} from "../config/resolveServerConfig"
import {ServerSetupError} from "../errors/server/ServerSetupError"
import {ServerSetupErrorCode} from "../errors/server/ServerSetupErrorCode"
import {applyServerName} from "../identity/ServerIdentityStore"
import {openServerStore} from "../store/instance"

import type {Command} from "commander"

type RenameOptions = {dataDir?: string}

/**
 * Registers `daily-server rename <name>`: sets the label Daily shows for this server. The name is
 * only a label — nothing keys off it — and it holds from here on, because a name derived from the
 * public address never replaces one that was chosen.
 */
export function registerRenameCommand(program: Command): void {
  program
    .command("rename")
    .description("Set the name Daily shows for this server")
    .argument("<name>", "the name to show")
    .option("--data-dir <path>", "server data directory")
    .action((name: string, opts: RenameOptions) => runRename(name, opts))
}

function runRename(name: string, opts: RenameOptions): void {
  const wanted = name.trim()

  if (!wanted) {
    throw new ServerSetupError(ServerSetupErrorCode.INVALID_ENVIRONMENT, "A server name cannot be blank")
  }

  const config = resolveServerConfig({dataDir: opts.dataDir})

  if (config.name) {
    throw new ServerSetupError(
      ServerSetupErrorCode.INVALID_ENVIRONMENT,
      `This server takes its name from DAILY_SERVER_NAME, currently "${config.name}", so renaming it from here would not survive a restart. Change that variable and recreate the container, or unset it to rename from here.`,
    )
  }

  const store = openServerStore(config.dataDir)

  try {
    const previousName = applyServerName(store, wanted)

    if (previousName) console.log(`Renamed server: ${previousName} -> ${wanted}`)
    else console.log(`This server is already named ${wanted}`)
  } finally {
    store.close()
  }
}
