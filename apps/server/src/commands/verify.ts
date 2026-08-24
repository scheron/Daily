import {resolveServerConfig} from "../config/resolveServerConfig"
import {loadIdentity} from "../identity/ServerIdentityStore"
import {openServerStore} from "../store/instance"
import {verifyPublicUrl} from "../verify/verifyPublicUrl"

import type {Command} from "commander"

type VerifyOptions = {dataDir?: string}

/**
 * Registers `daily-server verify [publicUrl]`: confirms the given (or configured) public address
 * reaches this server, exiting non-zero when it does not. The same check `start` runs
 * automatically while the server is unclaimed.
 */
export function registerVerifyCommand(program: Command): void {
  program
    .command("verify [publicUrl]")
    .description("Confirm this server's public address reaches it")
    .option("--data-dir <path>", "server data directory")
    .action((publicUrl: string | undefined, opts: VerifyOptions) => runVerify(publicUrl, opts))
}

async function runVerify(publicUrlArg: string | undefined, opts: VerifyOptions): Promise<void> {
  const config = resolveServerConfig({dataDir: opts.dataDir})
  const publicUrl = publicUrlArg ?? config.publicUrl
  if (!publicUrl) throw new Error("No public URL to verify: pass one as an argument, or set DAILY_SERVER_PUBLIC_URL")

  const store = openServerStore(config.dataDir)
  try {
    const identity = loadIdentity(store)
    await verifyPublicUrl(publicUrl, identity.serverId, config.transport === "self-signed")
    console.log(`${publicUrl} reaches this server.`)
  } finally {
    store.close()
  }
}
