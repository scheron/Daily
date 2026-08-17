import {realpathSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {Command} from "commander"

import pkg from "../../package.json"
import {registerClaimCodeCommand} from "./commands/claimCode"
import {registerDeviceCommand} from "./commands/device"
import {registerStartCommand} from "./commands/start"
import {registerStatusCommand} from "./commands/status"

export function buildProgram(): Command {
  const program = new Command()
  program.name("daily-server").description("Daily Sync Server").version(pkg.version)

  registerStartCommand(program)
  registerClaimCodeCommand(program)
  registerDeviceCommand(program)
  registerStatusCommand(program)

  return program
}

export function isServerEntryPoint(entryPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  return Boolean(entryPath) && realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl))
}

if (isServerEntryPoint()) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    })
}
