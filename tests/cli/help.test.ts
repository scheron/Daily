// @ts-nocheck
import {describe, expect, it} from "vitest"

import {buildProgram} from "@cli/index"

describe("daily --help", () => {
  it("shows the public top-level commands", () => {
    const program = buildProgram()
    const names = program.commands.map((c) => c.name())
    expect(names).toEqual(expect.arrayContaining(["today", "tasks", "task", "tags", "projects", "schema"]))
    expect(names).not.toEqual(expect.arrayContaining(["tag", "project"]))

    const help = program.helpInformation()
    expect(help).toContain("today")
    expect(help).toContain("tasks")
    expect(help).toContain("task")
    expect(help).toContain("tags")
    expect(help).toContain("projects")
    expect(help).toContain("Overview:")
    expect(help).toContain("Command model:")
    expect(help).toContain("Machine-readable output:")
    expect(help).toContain("Process behavior:")
    expect(help).toContain("Agent guidance:")
    expect(help).toContain("Exit codes: 0 success")
  })

  it("documents task examples and lookup rules", () => {
    const program = buildProgram()
    const tasks = program.commands.find((command) => command.name() === "tasks")!
    const task = program.commands.find((command) => command.name() === "task")!

    expect(tasks.helpInformation()).toContain("Examples:")
    expect(tasks.helpInformation()).toContain("daily tasks add")
    expect(tasks.helpInformation()).toContain("Task ids:")
    expect(tasks.helpInformation()).toContain("JSON result:")
    expect(tasks.helpInformation()).toContain("Subcommands:")
    expect(tasks.helpInformation()).toContain("help [command]")
    expect(task.helpInformation()).toContain("Task lookup:")
    expect(task.helpInformation()).toContain("Failure cases:")
    expect(task.helpInformation()).toContain("daily task abc123")
  })

  it("documents each task mutation as an automation contract", () => {
    const program = buildProgram()
    const tasks = program.commands.find((command) => command.name() === "tasks")!
    const expected = {
      search: ["Behavior:", "results", "global"],
      add: ["Arguments and defaults:", "Unknown values create new tags", "task.id"],
      done: ["Resolution and effect:", "updated task"],
      reactivate: ["Resolution and effect:", "updated task"],
      discard: ["Resolution and effect:", "updated task"],
      "log-time": ["Arguments and effect:", "stored in seconds"],
      move: ["Arguments and effect:", "current task time is preserved"],
      update: ["Editable fields:", "Omitted fields are left unchanged"],
      delete: ["trash", "--force", "irreversible", "Emptying the trash:"],
      restore: ["trash", "restored task"],
      deleted: ["trash", "most recently deleted first"],
    }

    for (const [name, fragments] of Object.entries(expected)) {
      const help = tasks.commands.find((command) => command.name() === name)!.helpInformation()
      for (const fragment of fragments) expect(help).toContain(fragment)
    }

    expect(tasks.commands.map((command) => command.name())).not.toContain("purge-deleted")
  })

  it("documents JSON shapes for resource list commands", () => {
    const program = buildProgram()
    expect(program.commands.find((command) => command.name() === "today")!.helpInformation()).toContain('"date":"YYYY-MM-DD"|null')
    expect(program.commands.find((command) => command.name() === "tags")!.helpInformation()).toContain('"tags":[Tag,...]')
    expect(program.commands.find((command) => command.name() === "projects")!.helpInformation()).toContain('"branches":[Branch,...]')
  })
})
