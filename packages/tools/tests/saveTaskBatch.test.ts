import {afterEach, describe, expect, it} from "vitest"

import {ToolError} from "../src/errors/ToolError"
import {saveTaskTool} from "../src/write/saveTask"
import {makeRealWorkspace} from "./helpers/realWorkspace"

describe("save_task — a batch of tasks is all-or-nothing", () => {
  let db: {close(): void} | undefined

  afterEach(() => {
    db?.close()
  })

  it("leaves the first item unwritten when the second one in the same batch fails", async () => {
    const {db: realDb, workStorage, ctx} = makeRealWorkspace()
    db = realDb

    await expect(
      saveTaskTool.run(
        {
          tasks: [{content: "Survives only if the whole batch commits"}, {id: "no-such-task", content: "this one fails"}],
        },
        ctx,
      ),
    ).rejects.toThrow(ToolError)

    const allTasks = await workStorage.getTaskList({includeBacklog: true})
    expect(allTasks.some((task) => task.content === "Survives only if the whole batch commits")).toBe(false)
  })

  it("commits every item together when all of them succeed", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    const result = (await saveTaskTool.run({tasks: [{content: "A"}, {content: "B"}]}, ctx)) as {tasks: Array<{content: string}>}

    expect(result.tasks.map((task) => task.content).sort()).toEqual(["A", "B"])
  })
})
