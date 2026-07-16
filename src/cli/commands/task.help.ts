import type {TaskStatus} from "@shared/types/storage"
import type {CommandHelp} from "../help"

export const TASKS_HELP: CommandHelp = {
  output: '{"tasks":[Task,...]}',
  details: `
Lists tasks for one calendar day (default today) in the active project.
Pass a date to list another day; use a subcommand to change tasks.

  daily tasks                  List today
  daily tasks 2026-07-20       List that day
  daily tasks --all --json     Every project, as JSON
  daily tasks add "Review PR"  Create a task (see the subcommands above)

Scope: --project <id|name> one project · --all every project (wins over --project).
Rows show scheduled time, status, first content line, and full id ("--:--" = no time).
Empty lists print "(no tasks)" and exit 0. JSON: {"ok":true,"data":{"tasks":[Task,...]}}.
Run "daily tasks help <subcommand>" for a mutation's full contract.
`,
}

export const TASK_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Reads one task by full id or unique prefix. A full id resolves across projects;
a prefix resolves in the active project unless --project or --all is given.
Ambiguous prefixes exit 2; no match exits 3.

  daily task a1b2
  daily task a1b2 --all --json
`,
}

export const TASK_SEARCH_HELP: CommandHelp = {
  output: '{"results":[{"score":number,"task":Task},...]}',
  details: `
Full-text search across all tasks, ignoring date and active project.
<query> is required; quote it when it contains spaces. Results are ranked by score.
No matches prints "(no matches)" and exits 0.

  daily tasks search "release notes"
  daily tasks search review --json
`,
}

export const TASK_ADD_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Creates an active task in the active project, or in --project.
Unknown tags are created automatically from their names.

  --date YYYY-MM-DD   default today        --tag <tag>      repeatable
  --time HH:MM        default now           --tags a,b,c     comma-separated
  --project <id|name> target project        --estimate <n>   minutes

Human output is "created <id>"; JSON is {"ok":true,"data":{"task":Task}}. Keep the
returned task.id for later mutations.

  daily tasks add "Review PR"
  daily tasks add "Deep work" --tags focus,writing --estimate 90 --json
`,
}

export function taskStatusHelp(name: string, status: TaskStatus): CommandHelp {
  return {
    output: '{"task":Task}',
    details: `
Sets status to "${status}". <id> is a full id or unique prefix; prefixes resolve in
the active project unless --project or --all is given. Re-running when already in
that status is allowed. Output is "${name} <id>" or the updated task as JSON.

  daily tasks ${name} a1b2
  daily tasks ${name} a1b2 --all --json
`,
  }
}

export const TASK_MOVE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Reschedules a task to <date>. Changes scheduling only; content, status, tags, and
estimate stay untouched. --time sets a new time; when omitted the current time is
kept. <date> is required (YYYY-MM-DD), <id> is a full id or unique prefix.

  daily tasks move a1b2 2026-07-20
  daily tasks move a1b2 2026-07-20 --time 09:30 --all
`,
}

export const TASK_UPDATE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Replaces a task's content with <content>. Does not touch status, tags, schedule,
estimate, or spent time — use "move" for the date/time and "estimate" for the
estimate. <content> is required; quote it. <id> is a full id or unique prefix.

  daily tasks update a1b2 "New title"
  daily tasks update a1b2 "Rewritten body" --json
`,
}

export const TASK_ESTIMATE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Sets the task's estimate to <minutes> (a positive integer), replacing any prior
value. This is the estimate, not logged time — use "log-time" to add time spent.
Task.estimatedTime is stored in seconds. <id> is a full id or unique prefix.

  daily tasks estimate a1b2 90
  daily tasks estimate a1b2 45 --all --json
`,
}

export const TASK_LOG_TIME_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Adds <minutes> (a positive integer) to the task's spent time; it accumulates, it
does not replace. Task.spentTime is stored in seconds. <id> is a full id or unique
prefix. Output is "logged <minutes>m on <id>" or the updated task as JSON.

  daily tasks log-time a1b2 25
  daily tasks log-time a1b2 60 --all
`,
}

export const TASK_DELETE_HELP: CommandHelp = {
  output: '{"task":Task} | {"count":number}',
  details: `
Moves a task to the trash; recover it with "daily tasks restore". With --force the
removal is permanent and irreversible. Without [taskId], --force empties the trash
in scope (active project, --project, or --all); omitting both is an error.
Prefixes resolve among live tasks; with --force they also match trashed tasks.

  daily tasks delete a1b2            daily tasks delete a1b2 --force
  daily tasks delete --force         daily tasks delete --all --force

Output: "deleted <id>", "purged <id>", or "purged <n> task(s)". JSON is
{"ok":true,"data":{"task":Task}} or {"ok":true,"data":{"count":n}}.
`,
}

export const TASK_RESTORE_HELP: CommandHelp = {
  output: '{"task":Task}',
  details: `
Restores a soft-deleted task from the trash with its previous status and fields.
Lookup happens among trashed tasks only; a full id matches across projects, a
prefix resolves in the active project unless --all is given.

  daily tasks restore a1b2
  daily tasks restore a1b2 --all --json
`,
}

export const TASK_DELETED_HELP: CommandHelp = {
  output: '{"tasks":[Task,...]}',
  details: `
Lists trashed tasks, most recently deleted first. Defaults to the active project;
--project selects one, --all lists every project's trash. Rows match the "daily
tasks" format; an empty trash prints "(no tasks)".

  daily tasks deleted
  daily tasks deleted --all --json
`,
}
