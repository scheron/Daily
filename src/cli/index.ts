import {realpathSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {Command} from "commander"

import pkg from "../../package.json"
import {registerProjectCommands} from "./commands/project"
import {registerSchemaCommand} from "./commands/schema"
import {registerSyncCommands} from "./commands/sync"
import {registerTagCommands} from "./commands/tag"
import {registerTaskCommands} from "./commands/task"
import {registerTodayCommand} from "./commands/today"
import {addHelpDetails, configureHelp} from "./help"
import {PROGRAM_HELP} from "./program.help"

export function buildProgram(): Command {
  const program = new Command()
  program
    .name("daily")
    .description("Daily task automation from the shell")
    .version(pkg.version)
    .option("--json", "output stable JSON")
    .option("--no-sync", "skip sync around this command (node mode)")
  program.enablePositionalOptions()
  configureHelp(program)
  addHelpDetails(program, PROGRAM_HELP)

  registerTodayCommand(program)
  registerTaskCommands(program)
  registerTagCommands(program)
  registerProjectCommands(program)
  registerSchemaCommand(program)
  registerSyncCommands(program)

  return program
}

export function isCliEntryPoint(entryPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  return Boolean(entryPath) && realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl))
}

if (isCliEntryPoint()) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    })
}
