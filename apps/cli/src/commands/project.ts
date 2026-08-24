import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatProjects, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {PROJECTS_CREATE_HELP, PROJECTS_DELETE_HELP, PROJECTS_HELP, PROJECTS_RENAME_HELP, PROJECTS_USE_HELP} from "./project.help"

import type {Command} from "commander"

export function registerProjectCommands(program: Command): void {
  const projects = addHelpDetails(
    program.command("projects").description("List and manage projects").option("--json", "output stable JSON"),
    PROJECTS_HELP,
  )
  projects.action(async (opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const branches = await cli.listProjects()
      console.log(merged.json ? renderJsonOk({branches}) : formatProjects(branches))
    })
  })

  addHelpDetails(
    projects.command("create <name>").description("Create a project").option("--json", "output stable JSON"),
    PROJECTS_CREATE_HELP,
  ).action(async (name, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const branch = await cli.createProject(name)
      console.log(merged.json ? renderJsonOk({branch}) : `created ${branch.id}`)
    })
  })

  addHelpDetails(
    projects.command("rename <id_or_name> <name>").description("Rename a project").option("--json", "output stable JSON"),
    PROJECTS_RENAME_HELP,
  ).action(async (idOrName, name, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const branch = await cli.renameProject(idOrName, name)
      console.log(merged.json ? renderJsonOk({branch}) : `renamed ${branch.id}`)
    })
  })

  addHelpDetails(
    projects.command("delete <id_or_name>").description("Delete a project").option("--json", "output stable JSON"),
    PROJECTS_DELETE_HELP,
  ).action(async (idOrName, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const branch = await cli.deleteProject(idOrName)
      console.log(merged.json ? renderJsonOk({branch}) : `deleted ${branch.id}`)
    })
  })

  addHelpDetails(
    projects.command("use <id_or_name>").description("Set the active project").option("--json", "output stable JSON"),
    PROJECTS_USE_HELP,
  ).action(async (idOrName, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const branch = await cli.useProject(idOrName)
      console.log(merged.json ? renderJsonOk({branch}) : `active ${branch.id}`)
    })
  })
}
