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
    expect(help).toContain('Task management (subcommands of "tasks"):')
    expect(help).toContain("Scope:")
    expect(help).toContain("Formats:")
    expect(help).toContain("JSON output:")
    expect(help).toContain("Agents:")
    expect(help).toContain("Exit codes: 0 ok")
  })

  it("documents task examples and lookup rules", () => {
    const program = buildProgram()
    const tasks = program.commands.find((command) => command.name() === "tasks")!
    const task = program.commands.find((command) => command.name() === "task")!

    const tasksHelp = tasks.helpInformation()
    expect(tasksHelp).toContain("daily tasks add")
    expect(tasksHelp).toContain("daily tasks 2026-07-20")
    expect(tasksHelp).toContain("estimate")
    expect(tasksHelp).toContain("help [command]")
    expect(task.helpInformation()).toContain("Reads one task")
    expect(task.helpInformation()).toContain("exits 3")
    expect(task.helpInformation()).toContain("daily task a1b2")
  })

  it("documents each task mutation as an automation contract", () => {
    const program = buildProgram()
    const tasks = program.commands.find((command) => command.name() === "tasks")!
    const expected = {
      search: ["Full-text search", "ranked by score"],
      add: ["Unknown tags are created automatically", "task.id"],
      done: ["Sets status to", "full id or unique prefix"],
      reactivate: ["Sets status to", "full id or unique prefix"],
      discard: ["Sets status to", "full id or unique prefix"],
      move: ["Reschedules a task", "the current time is"],
      update: ["Replaces a task's content", 'use "move"'],
      estimate: ["Sets the task's estimate", "stored in seconds"],
      "log-time": ["accumulates", "stored in seconds"],
      delete: ["trash", "--force", "irreversible", "empties the trash"],
      restore: ["trash", "previous status"],
      deleted: ["trash", "most recently deleted first"],
    }

    for (const [name, fragments] of Object.entries(expected)) {
      const help = tasks.commands.find((command) => command.name() === name)!.helpInformation()
      for (const fragment of fragments) expect(help, `${name} help should mention ${fragment}`).toContain(fragment)
    }

    expect(tasks.commands.map((command) => command.name())).not.toContain("purge-deleted")
  })

  it("documents JSON shapes for resource list commands", () => {
    const program = buildProgram()
    expect(program.commands.find((command) => command.name() === "today")!.helpInformation()).toContain('"date":"YYYY-MM-DD"|null')
    expect(program.commands.find((command) => command.name() === "tags")!.helpInformation()).toContain('"tags":[Tag,...]')
    expect(program.commands.find((command) => command.name() === "projects")!.helpInformation()).toContain('"branches":[Branch,...]')
  })

  it("exposes tags delete as a tag mutation", () => {
    const program = buildProgram()
    const tags = program.commands.find((command) => command.name() === "tags")!
    expect(tags.commands.map((command) => command.name())).toContain("delete")
    expect(tags.commands.find((command) => command.name() === "delete")!.helpInformation()).toContain("Deletes a tag")
  })
})
