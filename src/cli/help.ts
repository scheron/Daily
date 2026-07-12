import {Help} from "commander"

import type {Command} from "commander"

/** Structured command contract: prose for --help plus machine-readable metadata for "daily schema". */
export type CommandHelp = {
  /** Prose contract appended after the standard --help output. */
  details: string
  /** Shape of the "data" field in the success envelope, e.g. '{"task":Task}'. */
  output?: string
}

const HELP_KEY = Symbol("dailyCommandHelp")

export function configureHelp(program: Command): void {
  const defaultHelp = new Help()
  program.configureHelp({
    formatHelp(command, helper) {
      const help = getCommandHelp(command)
      const base = defaultHelp.formatHelp(command, helper)
      if (!help) return base
      return `${base}\n${help.details.trimEnd()}\n`
    },
  })
}

export function addHelpDetails<T extends Command>(command: T, help: CommandHelp): T {
  ;(command as unknown as Record<symbol, CommandHelp>)[HELP_KEY] = help
  return command
}

export function getCommandHelp(command: Command): CommandHelp | undefined {
  return (command as unknown as Record<symbol, CommandHelp | undefined>)[HELP_KEY]
}
