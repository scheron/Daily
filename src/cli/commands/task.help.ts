import type {TaskStatus} from "@shared/types/storage"
import type {CommandHelp} from "../help"

export const TASKS_HELP: CommandHelp = {
  output: '{"tasks":[Task,...]}',
  details: `
Default behavior:
  With no subcommand, daily tasks lists tasks scheduled for today in the active
  project. The date filter is one calendar day, not a range.

Scope selection:
  --date YYYY-MM-DD       Select another local calendar date.
  --project ID_OR_NAME    Use a project full id or exact, case-sensitive name.
  --all                   Include every project. This takes precedence over
                          --project if both are supplied.

Human-readable rows:
  Each row contains scheduled time, status, the first line of task content, and
  the full task id. "--:--" means that no scheduled time is stored. Empty lists
  print "(no tasks)" and still exit successfully.

JSON result:
  {"ok":true,"data":{"tasks":[Task,...]}}

Subcommands:
  search         Search task content globally
  add            Create a task
  done           Set status to done
  reactivate     Set status to active
  discard        Set status to discarded
  log-time       Add to spent time
  move           Change scheduled date/time
  update         Change editable fields
  delete         Move a task to trash; --force purges, without <taskId> empties the trash
  restore        Restore a task from trash
  deleted        List trashed tasks

Run "daily tasks help <subcommand>" for the complete contract of a mutation.

Examples:
  daily tasks
  daily tasks --date 2026-07-12
  daily tasks --project Work
  daily tasks --all --json
  daily tasks add "Review PR" --time 14:00 --tag work
  daily tasks done abc123

Task ids:
  Commands accepting <taskId> also accept a unique id prefix. Full ids resolve
  directly. Prefixes must be unique inside the selected project scope.
`,
}

export const TASK_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Task lookup:
  <taskId> may be a full id or a unique prefix. A full id resolves directly,
  including a task outside the active project. Prefix lookup uses the active
  project by default. Use --project for a different project or --all for every
  project. Ambiguous prefixes fail without selecting a task.

Output:
  Human output uses the same single-row format as "daily tasks".
  JSON output is {"ok":true,"data":{"task":Task}}.

Failure cases:
  Exit 2: the prefix matches more than one task.
  Exit 3: no task matches the id or prefix.

Examples:
  daily task abc123
  daily task abc123 --all
  daily task abc123 --json
`,
}

export const TASK_SEARCH_HELP: CommandHelp = {
  output: '{"results":[{"score":number,"task":Task},...]}',
  details: `
Searches task content across the local database.

Behavior:
  Search is global: it is not limited by date or active project. Results are
  ordered by the search service's relevance score. The query is a required
  positional argument; quote it when it contains spaces.

Human-readable rows:
  Each row contains relevance score, full task id, and the first line of task
  content. No matches prints "(no matches)" and exits successfully.

JSON result:
  {"ok":true,"data":{"results":[{"score":number,"task":Task},...]}}

Examples:
  daily tasks search "release notes"
  daily tasks search "review" --json
`,
}

export const TASK_ADD_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Creates a task in the active project unless --project is provided.
Unknown tags are created automatically.

Arguments and defaults:
  <content>               Required task text. Quote text containing spaces.
  --date YYYY-MM-DD       Scheduled date; defaults to local today.
  --time HH:MM            Scheduled local time; defaults to the current time.
  --project ID_OR_NAME    Target project full id or exact name.
  --estimate MINUTES      Positive integer; defaults to 0.

Tags:
  --tag TAG               Add one tag by full id or exact name. Repeatable.
  --tags TAG1,TAG2        Add a comma-separated list. Whitespace is trimmed.
  Both options may be combined. Unknown values create new tags using the value
  as the tag name. Tag and project name matching is case-sensitive.

Output and side effects:
  The task is created with status "active". Human output is "created <full-id>".
  JSON output is {"ok":true,"data":{"task":Task}}. Store task.id from this
  response for later deterministic mutations.

Examples:
  daily tasks add "Review PR"
  daily tasks add "Review PR" --date 2026-07-12 --time 14:00
  daily tasks add "Ship notes" --tag work --tag release
  daily tasks add "Deep work" --tags focus,writing --estimate 90 --json
`,
}

export function taskStatusHelp(name: string, status: TaskStatus): CommandHelp {
  return {
    output: '{"task":Task}',
    details: `
Changes task status to "${status}".
<taskId> may be a full id or a unique prefix.

Resolution and effect:
  Prefixes resolve in the active project by default. Use --project to select one
  project or --all to resolve across all projects. The operation sets the status
  directly; running it when the task already has that status is allowed.

Output:
  Human output is "${name} <full-id>".
  JSON output is {"ok":true,"data":{"task":Task}} with the updated task.

Examples:
  daily tasks ${name} abc123
  daily tasks ${name} abc123 --all
  daily tasks ${name} abc123 --json
`,
  }
}

export const TASK_LOG_TIME_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Adds minutes to the task's spent time.
<taskId> may be a full id or a unique prefix.

Arguments and effect:
  --minutes is required and must be a positive integer. The value is added to
  the existing spent time; it does not replace it. Repeating the command adds
  the duration again.

Scope and output:
  Prefix lookup uses the active project unless --project or --all is supplied.
  Human output is "logged <minutes>m on <full-id>".
  JSON output is {"ok":true,"data":{"task":Task}} with updated spentTime.
  Task.spentTime is stored in seconds.

Examples:
  daily tasks log-time abc123 --minutes 25
  daily tasks log-time abc123 --minutes 60 --all
`,
}

export const TASK_MOVE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Moves a task to another scheduled date and optionally updates its time.
If --time is omitted, the current task time is preserved.

Arguments and effect:
  --date YYYY-MM-DD is required. --time accepts local 24-hour HH:MM. This command
  changes scheduling only; content, status, tags, estimate, and project remain
  unchanged. There is no option here to clear an existing scheduled time.

Scope and output:
  Prefix lookup uses the active project unless --project or --all is supplied.
  Human output is "moved <full-id> to <date>".
  JSON output is {"ok":true,"data":{"task":Task}} with the updated schedule.

Examples:
  daily tasks move abc123 --date 2026-07-13
  daily tasks move abc123 --date 2026-07-13 --time 09:30
  daily tasks move abc123 --date 2026-07-13 --all --json
`,
}

export const TASK_UPDATE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Updates one or more editable task fields.
Omitted fields are left unchanged.

Editable fields:
  --content TEXT           Replace the complete task content.
  --date YYYY-MM-DD        Replace the scheduled date.
  --time HH:MM             Replace the scheduled local time.
  --estimate MINUTES       Replace the estimate with a positive integer value.

Behavior:
  Options may be combined in one atomic task update. This command does not
  change status, tags, spent time, or project. It cannot clear the time or set
  the estimate to zero. Prefix lookup uses the active project unless --project
  or --all is supplied.

Output:
  Human output is "updated <full-id>".
  JSON output is {"ok":true,"data":{"task":Task}} with all current fields.

Examples:
  daily tasks update abc123 --content "New title"
  daily tasks update abc123 --date 2026-07-13 --time 16:00
  daily tasks update abc123 --estimate 45 --json
`,
}

export const TASK_DELETE_HELP: CommandHelp = {
  output: '{"task":Task} | {"count":number}',
  details: `
Moves a task to the trash. With --force, permanently deletes it instead.
[taskId] may be a full id or a unique prefix.

Trash semantics:
  Without --force the task is soft-deleted: it leaves all lists but stays in
  the trash and can be recovered with "daily tasks restore". With --force the
  removal is permanent. That is irreversible; there is no undo.

Emptying the trash:
  Without [taskId], --force permanently deletes every trashed task in the
  selected scope: the active project by default, one project with --project,
  every project with --all. Omitting both [taskId] and --force is an error.

Resolution:
  Prefixes resolve among live tasks in the active project by default; --project
  and --all widen the scope. With --force, prefixes also match trashed tasks,
  so an already trashed task can be purged directly.

Output:
  Human output is "deleted <full-id>", "purged <full-id>", or "purged <n>
  task(s)" when emptying the trash.
  JSON output is {"ok":true,"data":{"task":Task}} for one task, or
  {"ok":true,"data":{"count":n}} when emptying the trash.

Examples:
  daily tasks delete abc123
  daily tasks delete abc123 --force
  daily tasks delete --force
  daily tasks delete --all --force
`,
}

export const TASK_RESTORE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Restores a soft-deleted task from the trash.
<taskId> may be a full id or a unique prefix.

Resolution and effect:
  Lookup happens among trashed tasks only. A full id matches across projects;
  prefixes resolve inside the active/selected project unless --all is used.
  The task returns to its lists with its previous status and fields intact.

Output:
  Human output is "restored <full-id>".
  JSON output is {"ok":true,"data":{"task":Task}} with the restored task.

Examples:
  daily tasks restore abc123
  daily tasks restore abc123 --all
  daily tasks restore abc123 --json
`,
}

export const TASK_DELETED_HELP: CommandHelp = {
  output: '{"tasks":[Task,...]}',
  details: `
Lists tasks currently in the trash, most recently deleted first.

Scope:
  Defaults to the active project. --project selects one project; --all lists
  the trash of every project.

Output:
  Human rows match the "daily tasks" format. An empty trash prints "(no tasks)".
  JSON output is {"ok":true,"data":{"tasks":[Task,...]}}.

Examples:
  daily tasks deleted
  daily tasks deleted --all --json
`,
}
