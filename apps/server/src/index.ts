import {realpathSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {Command, CommanderError} from "commander"

import pkg from "../package.json"
import {registerClaimCodeCommand} from "./commands/claimCode"
import {registerDeviceCommand} from "./commands/device"
import {registerHealthcheckCommand} from "./commands/healthcheck"
import {registerStartCommand} from "./commands/start"
import {registerStatusCommand} from "./commands/status"
import {registerVerifyCommand} from "./commands/verify"

const DASHED_ID_HINT =
  "A device id beginning with '-' still works: put options first, then '--', then the id — e.g. daily-server device revoke --data-dir <path> -- <id>"

function unknownOptionLooksLikeDeviceId(err: CommanderError): boolean {
  if (err.code !== "commander.unknownOption") return false

  const flag = /^error: unknown option '(-[^']+)'/.exec(err.message)?.[1] ?? ""
  return flag.length > 0 && !flag.startsWith("--")
}

export function buildProgram(): Command {
  const program = new Command()
  program.name("daily-server").description("Daily Sync Server").version(pkg.version).exitOverride()

  registerStartCommand(program)
  registerClaimCodeCommand(program)
  registerDeviceCommand(program)
  registerStatusCommand(program)
  registerVerifyCommand(program)
  registerHealthcheckCommand(program)

  return program
}

export function isServerEntryPoint(entryPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  return Boolean(entryPath) && realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl))
}

if (isServerEntryPoint()) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err) => {
      if (err instanceof CommanderError) {
        if (unknownOptionLooksLikeDeviceId(err)) console.error(DASHED_ID_HINT)
        process.exit(err.exitCode)
      }

      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    })
}
