import type {CommandHelp} from "../help"

export const SCHEMA_HELP: CommandHelp = {
  output: '{"schema":Schema}',
  details: `
Prints a machine-readable description of the entire CLI: every command with its
arguments and options, the shape of the success "data" payload per command,
error codes with exit codes, data types, and the contract version.

Intended use:
  Agents and scripts run this once instead of parsing help prose. The "help"
  field per command carries the same contract text that --help shows, so one
  call returns the complete surface.

Versioning:
  "version" is the application version. "schemaVersion" increments only when
  the meaning or shape of existing fields changes; new fields may be added
  without a bump.

Output:
  Requires no database access and always succeeds.
  Without --json the envelope is pretty-printed for reading; with --json it is
  compact on one line. Both forms are the same JSON:
  {"ok":true,"data":{"schema":Schema}}

Examples:
  daily schema
  daily schema --json
`,
}
