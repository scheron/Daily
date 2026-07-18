import type {CommandHelp} from "./help"

export const PROGRAM_HELP: CommandHelp = {
  details: `
Task management (subcommands of "tasks"):
  tasks add <content>              Create a task for today
  tasks done <id>                  Mark a task done
  tasks reactivate <id>            Move a task back to active
  tasks discard <id>               Discard a task
  tasks move <id> <date>           Reschedule a task
  tasks update <id> <content>      Replace task content
  tasks estimate <id> <minutes>    Set the estimate
  tasks log-time <id> <minutes>    Add minutes spent
  tasks delete <id>                Move a task to trash (--force purges)
  tasks restore <id>               Restore a task from trash
  tasks deleted                    List trashed tasks
  tasks search <query>             Full-text search across tasks
  tags delete <id|name>            Delete a tag

Scope:
  --project <id|name>   Scope to one project by full id or exact name.
  --all                 Span every project. Takes precedence over --project.
  Without either, commands use the project active in the desktop app.

Formats:
  date YYYY-MM-DD · time HH:MM (24h) · minutes/estimate = positive integer
  <id> = full task id or a unique id prefix (ambiguous prefixes fail).
  Quote content and queries with spaces; use -- before text starting with "-".

JSON output:
  --json prints one compact object; DAILY_JSON=1 makes it the session default.
  Success: {"ok":true,"data":{...}}   Failure (stderr): {"ok":false,"error":{"code","message"}}
  Field names are stable — parse JSON, not the human table output.

Process behavior:
  Mutations apply immediately with no prompt. Irreversible removal needs --force.
  Exit codes: 0 ok · 1 usage · 2 invalid/ambiguous · 3 not found · 4 refused · 5 sync failed.

Examples:
  daily tasks                       daily tasks add "Review PR"
  daily tasks 2026-07-20            daily tasks move a1b2 2026-07-20 --time 09:30
  daily task a1b2 --json            daily tasks delete a1b2 --force

Agents:
  Run "daily schema --json" for the full machine-readable contract (commands,
  arguments, options, output shapes, error codes, data types).
`,
}
