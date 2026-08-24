import {ProtocolError, ProtocolErrorCode} from "@daily/protocol"

import {resolveServerConfig} from "../config/resolveServerConfig"
import {ensureClaimCode, regenerateClaimCode} from "../identity/ServerIdentityStore"
import {openServerStore} from "../store/instance"

import type {Command} from "commander"

type ClaimCodeOptions = {dataDir?: string; regenerate?: boolean}

/** Registers `daily-server claim-code [--regenerate]`: prints the unclaimed server's claim code, or replaces it and clears the attempt lock. */
export function registerClaimCodeCommand(program: Command): void {
  program
    .command("claim-code")
    .description("Print the claim code of an unclaimed server")
    .option("--data-dir <path>", "server data directory")
    .option("--regenerate", "replace the claim code, clearing the attempt counter and any lock")
    .action((opts: ClaimCodeOptions) => runClaimCode(opts))
}

function runClaimCode(opts: ClaimCodeOptions): void {
  const config = resolveServerConfig({dataDir: opts.dataDir})
  const store = openServerStore(config.dataDir)

  try {
    const code = opts.regenerate ? regenerateClaimCode(store) : ensureClaimCode(store)

    if (code === null) {
      throw new ProtocolError(ProtocolErrorCode.ALREADY_CLAIMED, "This server is already claimed, so it has no claim code")
    }

    console.log(code)
  } finally {
    store.close()
  }
}
