// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {buildCliSchema} from "../src/commands/schema"
import {buildProgram} from "../src/index"
import {formatTaskList} from "../src/output"

/**
 * Drives the real commander tree with argv through parseAsync and asserts each
 * action receives correctly-parsed positional arguments and options. This locks
 * in the parent-does-not-swallow-subcommand-option fix (enablePositionalOptions):
 * a regression there would let --project/--time/--all reach the wrong command or
 * vanish, which these assertions would catch.
 */
const cliMock = vi.hoisted(() => ({
  addTask: vi.fn(async () => ({id: "abc123"})),
  listTasks: vi.fn(async () => []),
  listDeletedTasks: vi.fn(async () => []),
  today: vi.fn(async () => ({date: "2026-08-15", tasks: []})),
  describeTasks: vi.fn(async (tasks) => tasks.map((t) => ({task: t, projectName: "main", files: []}))),
  getTask: vi.fn(async () => ({id: "abc123", content: "x", status: "active", scheduled: {time: ""}})),
  setStatus: vi.fn(async () => ({id: "abc123"})),
  moveTask: vi.fn(async () => ({id: "abc123", scheduled: {date: "2026-07-20"}})),
  logTime: vi.fn(async () => ({id: "abc123"})),
  setEstimate: vi.fn(async () => ({id: "abc123"})),
  updateContent: vi.fn(async () => ({id: "abc123"})),
  addTaskTag: vi.fn(async () => ({id: "abc123"})),
  removeTaskTag: vi.fn(async () => ({id: "abc123"})),
  deleteTask: vi.fn(async () => ({id: "abc123"})),
  createTag: vi.fn(async () => ({id: "t1"})),
  updateTag: vi.fn(async () => ({id: "t1"})),
  moveTaskToProject: vi.fn(async () => ({id: "abc123", branchId: "project-id"})),
  createProject: vi.fn(async () => ({id: "p1"})),
  renameProject: vi.fn(async () => ({id: "p1"})),
  deleteProject: vi.fn(async () => ({id: "p1"})),
  useProject: vi.fn(async () => ({id: "p1"})),
  deleteTag: vi.fn(async () => ({id: "t1"})),
}))

vi.mock("../src/runtime", () => ({
  runCliCommand: async (_opts, run) => run(cliMock),
}))

async function runArgv(...args) {
  await buildProgram().parseAsync(args, {from: "user"})
}

describe("argv parsing through the real commander tree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("routes positional date + --time + --project to move without the parent swallowing them", async () => {
    await runArgv("tasks", "move", "abc123", "2026-07-20", "--time", "09:30", "--project", "work")
    expect(cliMock.moveTask).toHaveBeenCalledWith("abc123", {date: "2026-07-20", time: "09:30:00"}, expect.objectContaining({project: "work"}))
  })

  it("parses --project on move regardless of position relative to the date", async () => {
    await runArgv("tasks", "move", "abc123", "2026-08-02", "--project", "main")
    expect(cliMock.moveTask).toHaveBeenCalledWith("abc123", {date: "2026-08-02", time: undefined}, expect.objectContaining({project: "main"}))
  })

  it("passes positional minutes to log-time and estimate", async () => {
    await runArgv("tasks", "log-time", "abc123", "45")
    expect(cliMock.logTime).toHaveBeenCalledWith("abc123", 45, expect.anything())

    await runArgv("tasks", "estimate", "abc123", "90")
    expect(cliMock.setEstimate).toHaveBeenCalledWith("abc123", 90, expect.anything())
  })

  it("passes positional content to update", async () => {
    await runArgv("tasks", "update", "abc123", "new body")
    expect(cliMock.updateContent).toHaveBeenCalledWith("abc123", "new body", expect.anything())
  })

  it("routes task-tag mutations with task scope", async () => {
    await runArgv("tasks", "tag", "add", "abc123", "work", "--project", "main")
    expect(cliMock.addTaskTag).toHaveBeenCalledWith("abc123", "work", expect.objectContaining({project: "main"}))

    await runArgv("tasks", "tag", "remove", "abc123", "work", "--all")
    expect(cliMock.removeTaskTag).toHaveBeenCalledWith("abc123", "work", expect.objectContaining({all: true}))
  })

  it("treats the tasks operand as a list date, not a subcommand", async () => {
    await runArgv("tasks", "2026-07-20", "--all")
    expect(cliMock.listTasks).toHaveBeenCalledWith(expect.objectContaining({date: "2026-07-20", all: true}))
  })

  it("routes tag catalog mutations with their explicit options", async () => {
    await runArgv("tags", "create", "Asana", "--color", "#4ECDC4")
    expect(cliMock.createTag).toHaveBeenCalledWith("Asana", "#4ECDC4")

    await runArgv("tags", "update", "Asana", "--name", "Asana Import", "--color", "#FF1744")
    expect(cliMock.updateTag).toHaveBeenCalledWith("Asana", {name: "Asana Import", color: "#FF1744"})
  })

  it("routes project and move-project mutations", async () => {
    await runArgv("projects", "create", "Work")
    expect(cliMock.createProject).toHaveBeenCalledWith("Work")
    await runArgv("projects", "rename", "Work", "Client Work")
    expect(cliMock.renameProject).toHaveBeenCalledWith("Work", "Client Work")
    await runArgv("projects", "use", "Work")
    expect(cliMock.useProject).toHaveBeenCalledWith("Work")
    await runArgv("projects", "delete", "Work")
    expect(cliMock.deleteProject).toHaveBeenCalledWith("Work")
    await runArgv("tasks", "move-project", "abc123", "Work", "--all")
    expect(cliMock.moveTaskToProject).toHaveBeenCalledWith("abc123", "Work", {project: undefined, all: true})
  })

  it("routes tags delete with its positional identifier", async () => {
    await runArgv("tags", "delete", "typo-tag")
    expect(cliMock.deleteTag).toHaveBeenCalledWith("typo-tag")
  })

  it("keeps --json a global that subcommands still see", async () => {
    await runArgv("--json", "tasks", "done", "abc123")
    expect(cliMock.setStatus).toHaveBeenCalledWith("abc123", "done", expect.anything())
  })

  describe("detailed task output and --full routing", () => {
    afterEach(() => {
      cliMock.listTasks.mockReset()
      cliMock.listTasks.mockImplementation(async () => [])
      cliMock.listDeletedTasks.mockReset()
      cliMock.listDeletedTasks.mockImplementation(async () => [])
      cliMock.today.mockReset()
      cliMock.today.mockImplementation(async () => ({date: "2026-08-15", tasks: []}))
      cliMock.getTask.mockReset()
      cliMock.getTask.mockImplementation(async () => ({id: "abc123", content: "x", status: "active", scheduled: {time: ""}}))
      cliMock.describeTasks.mockReset()
      cliMock.describeTasks.mockImplementation(async (tasks) => tasks.map((t) => ({task: t, projectName: "main", files: []})))
    })

    it("TC-12: `daily task <id>` without --json prints the detailed layout, not the list line", async () => {
      const task = makeTask("abc123")
      cliMock.getTask.mockResolvedValueOnce(task)

      await runArgv("task", "abc123")

      expect(cliMock.describeTasks).toHaveBeenCalledWith([task])
      const printed = console.log.mock.calls[0][0]
      const firstLine = printed.split("\n")[0]
      expect(firstLine.slice(0, 9).trimEnd()).toBe("id")
      expect(firstLine.slice(11)).toBe("abc123")
    })

    it("TC-13: `daily task <id> --json` prints the unchanged stable envelope and skips describeTasks", async () => {
      const task = makeTask("abc123")
      cliMock.getTask.mockResolvedValueOnce(task)

      await runArgv("task", "abc123", "--json")

      expect(cliMock.describeTasks).not.toHaveBeenCalled()
      const printed = console.log.mock.calls[0][0]
      expect(printed).toBe(JSON.stringify({ok: true, data: {task}}))

      const schema = buildCliSchema(buildProgram())
      expect(Object.keys(JSON.parse(printed).data.task).sort()).toEqual(Object.keys(schema.types.Task).sort())
    })

    it("TC-14: `tasks --full` prints multiple detailed records separated by exactly one blank line, each starting with an id line", async () => {
      const tasks = [makeTask("t1"), makeTask("t2")]
      cliMock.listTasks.mockResolvedValueOnce(tasks)

      await runArgv("tasks", "--full")

      expect(cliMock.describeTasks).toHaveBeenCalledWith(tasks)
      const printed = console.log.mock.calls[0][0]
      const records = printed.split("\n\n")
      expect(records).toHaveLength(2)
      for (const record of records) {
        const firstLine = record.split("\n")[0]
        expect(firstLine.slice(0, 9).trimEnd()).toBe("id")
      }
    })

    it("TC-15: `today --full` routes through describeTasks and the detailed formatter", async () => {
      const tasks = [makeTask("t1"), makeTask("t2")]
      cliMock.today.mockResolvedValueOnce({date: "2026-08-15", tasks})

      await runArgv("today", "--full")

      expect(cliMock.describeTasks).toHaveBeenCalledWith(tasks)
      expect(console.log.mock.calls[0][0].split("\n\n")).toHaveLength(2)
    })

    it("TC-15: `tasks deleted --full` routes through describeTasks and the detailed formatter", async () => {
      const tasks = [makeTask("t1"), makeTask("t2")]
      cliMock.listDeletedTasks.mockResolvedValueOnce(tasks)

      await runArgv("tasks", "deleted", "--full")

      expect(cliMock.describeTasks).toHaveBeenCalledWith(tasks)
      expect(console.log.mock.calls[0][0].split("\n\n")).toHaveLength(2)
    })

    it("TC-16: `tasks --full` on an empty day prints (no tasks)", async () => {
      cliMock.listTasks.mockResolvedValueOnce([])

      await runArgv("tasks", "--full")

      expect(console.log.mock.calls[0][0]).toBe("(no tasks)")
    })

    it("TC-17: `tasks --full --json` still prints the tasks envelope and skips describeTasks", async () => {
      const tasks = [makeTask("t1"), makeTask("t2")]
      cliMock.listTasks.mockResolvedValueOnce(tasks)

      await runArgv("tasks", "--full", "--json")

      expect(cliMock.describeTasks).not.toHaveBeenCalled()
      expect(console.log.mock.calls[0][0]).toBe(JSON.stringify({ok: true, data: {tasks}}))
    })

    it("TC-18: `tasks` without --full still prints the plain one-line list format", async () => {
      const task = makeTask("abc123", {content: "A".repeat(90), scheduled: {date: "2026-08-15", time: "09:05:00", timezone: "UTC"}})
      cliMock.listTasks.mockResolvedValueOnce([task])

      await runArgv("tasks")

      expect(cliMock.describeTasks).not.toHaveBeenCalled()
      expect(console.log.mock.calls[0][0]).toBe(formatTaskList([task]))
    })
  })
})

function makeTask(id, overrides = {}) {
  return {
    id,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    scheduled: {date: "2026-08-15", time: "09:00:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    content: "",
    minimized: false,
    orderIndex: 1,
    status: "active",
    tags: [],
    attachments: [],
    ...overrides,
  }
}
