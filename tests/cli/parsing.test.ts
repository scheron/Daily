// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {buildProgram} from "@cli/index"

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
  getTask: vi.fn(async () => ({id: "abc123", content: "x", status: "active", scheduled: {time: ""}})),
  setStatus: vi.fn(async () => ({id: "abc123"})),
  moveTask: vi.fn(async () => ({id: "abc123", scheduled: {date: "2026-07-20"}})),
  logTime: vi.fn(async () => ({id: "abc123"})),
  setEstimate: vi.fn(async () => ({id: "abc123"})),
  updateContent: vi.fn(async () => ({id: "abc123"})),
  deleteTask: vi.fn(async () => ({id: "abc123"})),
  deleteTag: vi.fn(async () => ({id: "t1"})),
}))

vi.mock("@cli/runtime", () => ({
  runCliCommand: async (_opts, run) => run(cliMock),
}))

async function runArgv(...args) {
  await buildProgram().parseAsync(args, {from: "user"})
}

describe("argv parsing through the real commander tree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
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

  it("treats the tasks operand as a list date, not a subcommand", async () => {
    await runArgv("tasks", "2026-07-20", "--all")
    expect(cliMock.listTasks).toHaveBeenCalledWith(expect.objectContaining({date: "2026-07-20", all: true}))
  })

  it("routes tags delete with its positional identifier", async () => {
    await runArgv("tags", "delete", "typo-tag")
    expect(cliMock.deleteTag).toHaveBeenCalledWith("typo-tag")
  })

  it("keeps --json a global that subcommands still see", async () => {
    await runArgv("--json", "tasks", "done", "abc123")
    expect(cliMock.setStatus).toHaveBeenCalledWith("abc123", "done", expect.anything())
  })
})
