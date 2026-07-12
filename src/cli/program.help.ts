import type {CommandHelp} from "./help"

export const PROGRAM_HELP: CommandHelp = {
  details: `
Overview:
  daily is a non-interactive interface to the same local database used by the
  Daily desktop app. Changes made by the CLI are visible in the app and changes
  made in the app are visible to the CLI.

Command model:
  daily tasks                  List tasks and access task-changing commands
  daily task <taskId>          Read one task
  daily tags                   List tags
  daily projects               List projects
  daily today                  Read today's tasks in the active project
  daily schema                 Print the machine-readable CLI contract

  Plural nouns list resources. The singular "task" command reads one resource.
  Task mutations are subcommands of "tasks": add, done, reactivate, discard,
  log-time, move, update, delete, and restore.
  "daily tasks deleted" lists the trash.

Defaults and scope:
  Dates use the computer's local calendar and default to today.
  Commands use the project currently active in the desktop app by default.
  --project <id_or_name> selects one project by full id or exact name.
  --all removes project scoping where the option is available.
  Do not combine --project and --all; --all takes precedence.

Identifiers:
  <taskId> accepts a full task id or a unique id prefix. A full id is resolved
  directly. Prefixes are resolved in the active/selected project unless --all
  is used. If a prefix matches multiple tasks, the command fails and prints the
  matching full ids. Use one of those full ids to retry.

Input formats:
  Dates: YYYY-MM-DD, for example 2026-07-12.
  Times: 24-hour HH:MM, for example 09:30 or 18:05.
  Durations and estimates: positive integer minutes.
  Quote task content and search queries containing spaces or shell characters.
  Use -- before positional text that begins with "-".

Machine-readable output:
  Pass --json to any command to receive one compact JSON object on stdout, or
  set DAILY_JSON=1 in the environment to make JSON the session default.
  Successful output has the envelope:
    {"ok":true,"data":{...}}
  Handled failures are written to stderr as:
    {"ok":false,"error":{"code":"TASK_NOT_FOUND","message":"..."}}
  JSON field names are stable. Treat fields inside Task, Tag, and Branch objects
  as API data; do not parse the human-readable table output.

Process behavior:
  Commands do not prompt for confirmation. Mutations are applied immediately.
  Irreversible removal is gated by the explicit --force flag: "tasks delete
  <taskId> --force" purges one task, "tasks delete --force" empties the trash.
  stdout contains successful command output; stderr contains diagnostics.
  Exit codes: 0 success, 1 unexpected/usage error, 2 invalid or ambiguous input,
  3 task/project not found, 4 storage refused the requested mutation.

Help navigation:
  daily --help
  daily help tasks
  daily tasks --help
  daily tasks help add
  daily tasks add --help

Common commands:
  daily schema --json                 Machine-readable contract of every command
  daily tasks                         List today's tasks
  daily tasks add "Review PR"         Create a task for today
  daily task abc123                   Show a task by full id or unique prefix
  daily tags                          List tags
  daily projects                      List projects

Agent guidance:
  Run "daily schema --json" once to discover every command, argument, option,
  output shape, error code, and data type; prefer it over parsing help prose.
  Set DAILY_JSON=1 for the session instead of repeating --json.
  Discover projects with "daily projects --json" before using --project.
  Discover or create tasks with --json and retain the returned full task id.
  Use full ids for mutations when deterministic execution matters.
  Check the process exit code before consuming output.
`,
}
