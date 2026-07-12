import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTaskList, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {TODAY_HELP} from "./today.help"

import type {Command} from "commander"

export function registerTodayCommand(program: Command): void {
  addHelpDetails(
    program.command("today").description("Show today's tasks in the active project").option("--json", "output stable JSON"),
    TODAY_HELP,
  ).action(async (opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const day = await cli.today()
      const tasks = day?.tasks ?? []
      console.log(merged.json ? renderJsonOk({date: day?.date ?? null, tasks}) : formatTaskList(tasks))
    })
  })
}
