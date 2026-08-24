import type {Command} from "commander"

/**
 * Merges an action's options with global options inherited from parent commands
 * and applies environment defaults: DAILY_JSON=1 enables --json for the session.
 *
 * @param opts Options object passed to the commander action.
 * @param command The command the action belongs to.
 * @example
 * .action((opts, command) => run(readOptions(opts, command)))
 */
export function readOptions<T extends Record<string, unknown>>(opts: T, command: Command): T & {json?: boolean} {
  const merged = {...command.optsWithGlobals(), ...opts} as T & {json?: boolean}
  if (merged.json === undefined && process.env.DAILY_JSON === "1") merged.json = true
  return merged
}
