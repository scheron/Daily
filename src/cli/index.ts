import {pathToFileURL} from "node:url"
import {Command} from "commander"

import pkg from "../../package.json"
import {registerProjectCommands} from "./commands/project"
import {registerSchemaCommand} from "./commands/schema"
import {registerTagCommands} from "./commands/tag"
import {registerTaskCommands} from "./commands/task"
import {registerTodayCommand} from "./commands/today"
import {addHelpDetails, configureHelp} from "./help"
import {PROGRAM_HELP} from "./program.help"

export function buildProgram(): Command {
  const program = new Command()
  program.name("daily").description("Daily task automation from the shell").version(pkg.version).option("--json", "output stable JSON")
  program.enablePositionalOptions()
  configureHelp(program)
  addHelpDetails(program, PROGRAM_HELP)

  registerTodayCommand(program)
  registerTaskCommands(program)
  registerTagCommands(program)
  registerProjectCommands(program)
  registerSchemaCommand(program)

  return program
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    })
}
