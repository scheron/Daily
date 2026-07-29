import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTags, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {TAG_CREATE_HELP, TAG_DELETE_HELP, TAG_UPDATE_HELP, TAGS_HELP} from "./tag.help"

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
    tags
      .command("create <name>")
      .description("Create a tag with an explicit color")
      .requiredOption("--color <#RRGGBB>", "tag color")
      .option("--json", "output stable JSON"),
    TAG_CREATE_HELP,
  ).action(async (name, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const tag = await cli.createTag(name, opts.color)
      console.log(merged.json ? renderJsonOk({tag}) : `created ${tag.id}`)
    })
  })

  addHelpDetails(
    tags
      .command("update <id_or_name>")
      .description("Rename or recolor a tag")
      .option("--name <name>", "new tag name")
      .option("--color <#RRGGBB>", "new tag color")
      .option("--json", "output stable JSON"),
    TAG_UPDATE_HELP,
  ).action(async (idOrName, opts, command) => {
    const merged = readOptions(opts, command)
    await runCliCommand(merged, async (cli) => {
      const tag = await cli.updateTag(idOrName, {name: opts.name, color: opts.color})
      console.log(merged.json ? renderJsonOk({tag}) : `updated ${tag.id}`)
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
