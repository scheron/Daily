import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTags, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {TAGS_HELP} from "./tag.help"

import type {Command} from "commander"

export function registerTagCommands(program: Command): void {
  addHelpDetails(program.command("tags").description("List tags").option("--json", "output stable JSON"), TAGS_HELP).action(async (opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const tags = await cli.listTags()
      console.log(merged.json ? renderJsonOk({tags}) : formatTags(tags))
    })
  })
}
