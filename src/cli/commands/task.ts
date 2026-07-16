import {addHelpDetails} from "../help"
import {readOptions} from "../options"
import {formatTaskList, renderJsonOk} from "../output"
import {runCliCommand} from "../runtime"
import {assertDeleteTarget, assertPositiveMinutes, assertValidDate, assertValidTime} from "../validate"
import {
  TASK_ADD_HELP,
  TASK_DELETE_HELP,
  TASK_DELETED_HELP,
  TASK_ESTIMATE_HELP,
  TASK_HELP,
  TASK_LOG_TIME_HELP,
  TASK_MOVE_HELP,
  TASK_RESTORE_HELP,
  TASK_SEARCH_HELP,
  TASK_UPDATE_HELP,
  TASKS_HELP,
  taskStatusHelp,
} from "./task.help"

import type {TaskStatus} from "@shared/types/storage"
import type {Command} from "commander"

type TaskScopeOptions = {project?: string; all?: boolean; json?: boolean}
type TaskAddOptions = {date?: string; time?: string; tag?: string[]; tags?: string; project?: string; estimate?: string; json?: boolean}
type TaskMoveOptions = TaskScopeOptions & {time?: string}
type TaskDeleteOptions = TaskScopeOptions & {force?: boolean}

export function registerTaskCommands(program: Command): void {
  const tasks = program
    .command("tasks")
    .description("List and manage tasks")
    .argument("[date]", "list tasks for this date (default today)")
    .addHelpCommand()
    .option("--project <id_or_name>", "scope to a project")
    .option("--all", "span every project")
    .option("--json", "output stable JSON")
  tasks.enablePositionalOptions()
  tasks.action((date, opts, command) => runListTasks(date, readOptions(opts, command)))
  addHelpDetails(tasks, TASKS_HELP)

  registerTaskMutations(tasks)

  const task = program
    .command("task")
    .description("Show a single task")
    .argument("[taskId]", "task id or unique prefix")
    .option("--project <id_or_name>", "scope for id resolution")
    .option("--all", "resolve id across every project")
    .option("--json", "output stable JSON")
    .action((taskId, opts, command) => {
      if (!taskId) return command.help()
      return runGetTask(taskId, readOptions(opts, command))
    })
  addHelpDetails(task, TASK_HELP)
}

function registerTaskMutations(task: Command): void {
  addHelpDetails(
    task.command("search <query>").description("Full-text search across tasks").option("--json", "output stable JSON"),
    TASK_SEARCH_HELP,
  ).action((query, opts, command) => runSearchTasks(query, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("add <content>")
      .description("Create a task")
      .option("--date <YYYY-MM-DD>", "scheduled date (default today)")
      .option("--time <HH:MM>", "scheduled time")
      .option("--tag <tag>", "add a tag (repeatable)", (v: string, acc: string[]) => [...acc, v], [] as string[])
      .option("--tags <list>", "comma-separated tags")
      .option("--project <id_or_name>", "target project")
      .option("--estimate <minutes>", "estimate in minutes")
      .option("--json", "output stable JSON"),
    TASK_ADD_HELP,
  ).action((content, opts, command) => runAddTask(content, readOptions(opts, command)))

  const STATUS_COMMANDS: Array<{name: string; desc: string; status: TaskStatus}> = [
    {name: "done", desc: "Mark a task done", status: "done"},
    {name: "reactivate", desc: "Reactivate a task", status: "active"},
    {name: "discard", desc: "Discard a task", status: "discarded"},
  ]

  for (const {name, desc, status} of STATUS_COMMANDS) {
    addHelpDetails(
      task
        .command(`${name} <taskId>`)
        .description(desc)
        .option("--project <id_or_name>", "scope for id resolution")
        .option("--all", "resolve id across every project")
        .option("--json", "output stable JSON"),
      taskStatusHelp(name, status),
    ).action((taskId, opts, command) => runSetStatus(name, taskId, status, readOptions(opts, command)))
  }

  addHelpDetails(
    task
      .command("move <taskId> <date>")
      .description("Reschedule a task to a new date")
      .option("--time <HH:MM>", "new scheduled time")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_MOVE_HELP,
  ).action((taskId, date, opts, command) => runMoveTask(taskId, date, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("update <taskId> <content>")
      .description("Replace a task's content")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_UPDATE_HELP,
  ).action((taskId, content, opts, command) => runUpdateTask(taskId, content, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("estimate <taskId> <minutes>")
      .description("Set a task's estimate")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_ESTIMATE_HELP,
  ).action((taskId, minutes, opts, command) => runSetEstimate(taskId, minutes, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("log-time <taskId> <minutes>")
      .description("Add to a task's spent time")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_LOG_TIME_HELP,
  ).action((taskId, minutes, opts, command) => runLogTime(taskId, minutes, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("delete [taskId]")
      .description("Move a task to trash; with --force delete permanently, without <taskId> empty the trash")
      .option("--force", "permanently delete instead of moving to trash")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_DELETE_HELP,
  ).action((taskId, opts, command) => runDeleteTask(taskId, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("restore <taskId>")
      .description("Restore a task from trash")
      .option("--project <id_or_name>", "scope for id resolution")
      .option("--all", "resolve id across every project")
      .option("--json", "output stable JSON"),
    TASK_RESTORE_HELP,
  ).action((taskId, opts, command) => runRestoreTask(taskId, readOptions(opts, command)))

  addHelpDetails(
    task
      .command("deleted")
      .description("List trashed tasks")
      .option("--project <id_or_name>", "scope to a project")
      .option("--all", "span every project")
      .option("--json", "output stable JSON"),
    TASK_DELETED_HELP,
  ).action((opts, command) => runListDeletedTasks(readOptions(opts, command)))
}

async function runListTasks(date: string | undefined, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const validDate = date ? assertValidDate(date) : undefined
    const tasks = await cli.listTasks({date: validDate, project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({tasks}) : formatTaskList(tasks))
  })
}

async function runGetTask(taskId: string, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const task = await cli.getTask(taskId, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : formatTaskList([task]))
  })
}

async function runSearchTasks(query: string, opts: {json?: boolean}): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const results = await cli.searchTasks(query)
    if (opts.json) return console.log(renderJsonOk({results}))
    console.log(
      results.length
        ? results.map((r) => `${r.score.toFixed(2)}  ${r.task.id}  ${r.task.content.split("\n")[0].slice(0, 60)}`).join("\n")
        : "(no matches)",
    )
  })
}

async function runAddTask(content: string, opts: TaskAddOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const date = opts.date ? assertValidDate(opts.date) : undefined
    const time = opts.time ? assertValidTime(opts.time) : undefined
    const estimateMinutes = opts.estimate ? assertPositiveMinutes(opts.estimate) : undefined
    const tags = [
      ...(opts.tag ?? []),
      ...(opts.tags
        ? opts.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
    ]

    const task = await cli.addTask({content, date, time, tags, project: opts.project, estimateMinutes})
    console.log(opts.json ? renderJsonOk({task}) : `created ${task.id}`)
  })
}

async function runSetStatus(name: string, taskId: string, status: TaskStatus, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const task = await cli.setStatus(taskId, status, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `${name} ${task.id}`)
  })
}

async function runLogTime(taskId: string, minutesInput: string, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const minutes = assertPositiveMinutes(minutesInput)
    const task = await cli.logTime(taskId, minutes, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `logged ${minutes}m on ${task.id}`)
  })
}

async function runSetEstimate(taskId: string, minutesInput: string, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const minutes = assertPositiveMinutes(minutesInput)
    const task = await cli.setEstimate(taskId, minutes, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `estimated ${task.id} at ${minutes}m`)
  })
}

async function runMoveTask(taskId: string, dateInput: string, opts: TaskMoveOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const date = assertValidDate(dateInput)
    const time = opts.time ? assertValidTime(opts.time) : undefined
    const task = await cli.moveTask(taskId, {date, time}, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `moved ${task.id} to ${task.scheduled.date}`)
  })
}

async function runUpdateTask(taskId: string, content: string, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const task = await cli.updateContent(taskId, content, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `updated ${task.id}`)
  })
}

async function runDeleteTask(taskId: string | undefined, opts: TaskDeleteOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    assertDeleteTarget(taskId, opts.force)
    const scope = {project: opts.project, all: opts.all}

    if (!taskId) {
      const count = await cli.purgeDeletedTasks(scope)
      console.log(opts.json ? renderJsonOk({count}) : `purged ${count} task(s)`)
      return
    }

    const task = opts.force ? await cli.purgeTask(taskId, scope) : await cli.deleteTask(taskId, scope)
    console.log(opts.json ? renderJsonOk({task}) : `${opts.force ? "purged" : "deleted"} ${task.id}`)
  })
}

async function runRestoreTask(taskId: string, opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const task = await cli.restoreTask(taskId, {project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({task}) : `restored ${task.id}`)
  })
}

async function runListDeletedTasks(opts: TaskScopeOptions): Promise<void> {
  await runCliCommand(opts, async (cli) => {
    const tasks = await cli.listDeletedTasks({project: opts.project, all: opts.all})
    console.log(opts.json ? renderJsonOk({tasks}) : formatTaskList(tasks))
  })
}
