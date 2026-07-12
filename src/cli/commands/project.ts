import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatProjects, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {PROJECTS_HELP} from "./project.help"

import type {Command} from "commander"

export function registerProjectCommands(program: Command): void {
  addHelpDetails(program.command("projects").description("List projects").option("--json", "output stable JSON"), PROJECTS_HELP).action(
    async (opts, command) => {
      const merged = readOptions(opts, command)
      await runCliCommand(merged, async (cli) => {
        const branches = await cli.listProjects()
        console.log(merged.json ? renderJsonOk({branches}) : formatProjects(branches))
      })
    },
  )
}
