import {listCliErrorCodes} from "@shared/errors/cli/CliError"

import {addHelpDetails, getCommandHelp} from "../help"
import {readOptions} from "../options"
import {SCHEMA_HELP} from "./schema.help"

import type {Command} from "commander"

/** Bumped only when the meaning or shape of existing schema fields changes. */
export const CLI_SCHEMA_VERSION = 1

export function registerSchemaCommand(program: Command): void {
  addHelpDetails(
    program.command("schema").description("Print the machine-readable CLI contract").option("--json", "compact single-line output"),
    SCHEMA_HELP,
  ).action((opts, command) => {
    const envelope = {ok: true, data: {schema: buildCliSchema(program)}}
    console.log(readOptions(opts, command).json ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2))
  })
}

/**
 * Builds the full machine-readable CLI contract from the commander tree and the
 * per-command contracts registered via addHelpDetails.
 *
 * @param program The fully configured root command.
 */
export function buildCliSchema(program: Command) {
  return {
    name: program.name(),
    version: program.version() ?? "0.0.0",
    schemaVersion: CLI_SCHEMA_VERSION,
    description: program.description(),
    envelope: {
      success: '{"ok":true,"data":{...}}',
      failure: '{"ok":false,"error":{"code":string,"message":string}}',
      failureStream: "stderr",
    },
    json: {flag: "--json", env: "DAILY_JSON=1"},
    exitCodes: {
      "0": "success",
      "1": "unexpected or usage error",
      "2": "invalid or ambiguous input",
      "3": "task or project not found",
      "4": "mutation refused",
      "5": "sync failed",
    },
    errorCodes: listCliErrorCodes(),
    types: SCHEMA_TYPES,
    commands: collectCommands(program),
  }
}

const SCHEMA_TYPES = {
  Task: {
    id: "string",
    createdAt: "ISO datetime",
    updatedAt: "ISO datetime",
    deletedAt: "ISO datetime | null",
    branchId: "string (project id)",
    scheduled: '{"date":"YYYY-MM-DD","time":"HH:MM:SS"|"","timezone":string}',
    estimatedTime: "number (seconds)",
    spentTime: "number (seconds)",
    content: "string (markdown)",
    minimized: "boolean",
    orderIndex: "number",
    status: '"active" | "done" | "discarded"',
    tags: "Tag[]",
    attachments: "Attachment[]",
  },
  Tag: {
    id: "string",
    createdAt: "ISO datetime",
    updatedAt: "ISO datetime",
    deletedAt: "ISO datetime | null",
    name: "string",
    color: "string (hex)",
  },
  Branch: {
    id: "string",
    createdAt: "ISO datetime",
    updatedAt: "ISO datetime",
    deletedAt: "ISO datetime | null",
    name: "string",
  },
}

function collectCommands(program: Command) {
  const commands: Array<ReturnType<typeof describeCommand>> = []

  const walk = (parent: Command, prefix: string) => {
    for (const command of parent.commands) {
      if (command.name() === "help") continue
      const name = prefix ? `${prefix} ${command.name()}` : command.name()
      commands.push(describeCommand(command, name))
      walk(command, name)
    }
  }

  walk(program, "")
  return commands
}

function describeCommand(command: Command, name: string) {
  const help = getCommandHelp(command)
  return {
    name,
    description: command.description(),
    arguments: command.registeredArguments.map((arg) => ({name: arg.name(), required: arg.required, variadic: arg.variadic})),
    options: command.options.map((option) => ({flags: option.flags, description: option.description})),
    output: help?.output,
    help: help?.details.trim(),
  }
}
