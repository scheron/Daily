import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTags, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {TAG_DELETE_HELP, TAGS_HELP} from "./tag.help"

import type {Command} from "commander"

export function registerTagCommands(program: Command): void {
  const tags = addHelpDetails(program.command("tags").description("List tags").option("--json", "output stable JSON"), TAGS_HELP)
  tags.enablePositionalOptions()
  tags.action(async (opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const list = await cli.listTags()
      console.log(merged.json ? renderJsonOk({tags: list}) : formatTags(list))
    })
  })

  addHelpDetails(
    tags.command("delete <id_or_name>").description("Delete a tag by full id or exact name").option("--json", "output stable JSON"),
    TAG_DELETE_HELP,
  ).action(async (idOrName, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const tag = await cli.deleteTag(idOrName)
      console.log(merged.json ? renderJsonOk({tag}) : `deleted ${tag.id}`)
    })
  })
}
