// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliController} from "@cli/CliController"
import {buildCliSchema} from "@cli/commands/schema"
import {buildProgram} from "@cli/index"
import {createStorageCore} from "@main/storage/createStorageCore"
import pkg from "../../package.json"
import {createTestDatabase} from "../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))
const paths = {
  appDataRoot: () => "/tmp/d",
  dbPath: () => "/tmp/d/db",
  assetsDir: () => "/tmp/d/a",
  remoteSyncPath: () => "/tmp/d/r",
  mutationSignalPath: () => "/tmp/d/.s",
}

describe("buildCliSchema", () => {
  it("describes the program with name, version, and schemaVersion", () => {
    const schema = buildCliSchema(buildProgram())

    expect(schema.name).toBe("daily")
    expect(schema.version).toBe(pkg.version)
    expect(schema.schemaVersion).toBe(1)
    expect(schema.envelope.success).toContain('"ok":true')
    expect(schema.envelope.failure).toContain('"error"')
  })

  it("lists every command with its full path and skips help commands", () => {
    const names = buildCliSchema(buildProgram()).commands.map((c) => c.name)

    expect(names).toEqual(
      expect.arrayContaining([
        "today",
        "tasks",
        "tasks add",
        "tasks move",
        "tasks update",
        "tasks estimate",
        "tasks log-time",
        "tasks delete",
        "tasks restore",
        "tasks deleted",
        "task",
        "tags",
        "tags delete",
        "projects",
        "schema",
      ]),
    )
    expect(names.some((n) => n === "tasks help" || n.endsWith(" help"))).toBe(false)
  })

  it("models scheduling, content, and time inputs as positional arguments", () => {
    const commands = buildCliSchema(buildProgram()).commands

    const tasks = commands.find((c) => c.name === "tasks")
    expect(tasks.arguments).toEqual([expect.objectContaining({name: "date", required: false})])
    expect(tasks.options.map((o) => o.flags)).not.toContain("--date <YYYY-MM-DD>")

    const move = commands.find((c) => c.name === "tasks move")
    expect(move.arguments).toEqual([
      expect.objectContaining({name: "taskId", required: true}),
      expect.objectContaining({name: "date", required: true}),
    ])
    expect(move.options.map((o) => o.flags)).not.toContain("--date <YYYY-MM-DD>")

    const update = commands.find((c) => c.name === "tasks update")
    expect(update.arguments).toEqual([
      expect.objectContaining({name: "taskId", required: true}),
      expect.objectContaining({name: "content", required: true}),
    ])

    const estimate = commands.find((c) => c.name === "tasks estimate")
    expect(estimate.arguments).toEqual([
      expect.objectContaining({name: "taskId", required: true}),
      expect.objectContaining({name: "minutes", required: true}),
    ])

    const logTime = commands.find((c) => c.name === "tasks log-time")
    expect(logTime.arguments).toEqual([
      expect.objectContaining({name: "taskId", required: true}),
      expect.objectContaining({name: "minutes", required: true}),
    ])
    expect(logTime.options.map((o) => o.flags)).not.toContain("--minutes <n>")

    const tagDelete = commands.find((c) => c.name === "tags delete")
    expect(tagDelete.arguments).toEqual([expect.objectContaining({name: "id_or_name", required: true})])
  })

  it("describes arguments, options, output shape, and prose contract per command", () => {
    const schema = buildCliSchema(buildProgram())
    const add = schema.commands.find((c) => c.name === "tasks add")

    expect(add.arguments).toEqual([expect.objectContaining({name: "content", required: true})])
    expect(add.options.map((o) => o.flags)).toEqual(expect.arrayContaining(["--date <YYYY-MM-DD>", "--tag <tag>", "--json"]))
    expect(add.output).toBe('{"task":Task}')
    expect(add.help).toContain("Unknown tags are created automatically")

    const del = schema.commands.find((c) => c.name === "tasks delete")
    expect(del.arguments).toEqual([expect.objectContaining({name: "taskId", required: false})])
    expect(del.output).toBe('{"task":Task} | {"count":number}')
  })

  it("gives every command a description, an output shape, and a help contract", () => {
    for (const command of buildCliSchema(buildProgram()).commands) {
      expect(command.description, command.name).toBeTruthy()
      expect(command.output, command.name).toBeTruthy()
      expect(command.help, command.name).toBeTruthy()
    }
  })

  it("exposes error codes with their exit codes", () => {
    const schema = buildCliSchema(buildProgram())

    expect(schema.errorCodes).toContainEqual({code: "TASK_NOT_FOUND", exitCode: 3})
    expect(schema.errorCodes).toContainEqual({code: "AMBIGUOUS_ID", exitCode: 2})
    expect(schema.errorCodes).toContainEqual({code: "INVALID_ARGUMENT", exitCode: 2})
    expect(schema.errorCodes).toContainEqual({code: "REFUSED", exitCode: 4})
  })

  describe("documented types match the real data shapes", () => {
    let db, core, cli
    beforeEach(() => {
      db = createTestDatabase()
      core = createStorageCore(db, paths)
      cli = new CliController(core, paths)
    })
    afterEach(() => db.close())

    it("Task, Tag, and Branch field lists stay in sync with reality", async () => {
      const task = await cli.addTask({content: "Shape probe", tags: ["work"]})
      const [branch] = await cli.listProjects()
      const schema = buildCliSchema(buildProgram())

      expect(Object.keys(schema.types.Task).sort()).toEqual(Object.keys(task).sort())
      expect(Object.keys(schema.types.Tag).sort()).toEqual(Object.keys(task.tags[0]).sort())
      expect(Object.keys(schema.types.Branch).sort()).toEqual(Object.keys(branch).sort())
    })
  })
})
