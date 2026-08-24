import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTaskDetails, formatTaskList, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {TODAY_HELP} from "./today.help"

import type {Command} from "commander"

export function registerTodayCommand(program: Command): void {
  addHelpDetails(
    program
      .command("today")
      .description("Show today's tasks in the active project")
      .option("--full", "print the detailed layout for every task")
      .option("--json", "output stable JSON"),
    TODAY_HELP,
  ).action(async (opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const day = await cli.today()
      const tasks = day?.tasks ?? []
      if (merged.json) return console.log(renderJsonOk({date: day?.date ?? null, tasks}))
      console.log(merged.full ? formatTaskDetails(await cli.describeTasks(tasks)) : formatTaskList(tasks))
    })
  })
}
