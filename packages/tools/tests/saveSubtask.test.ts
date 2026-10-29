import {describe, expect, it} from "vitest"

import {saveSubtaskTool} from "../src/write/saveSubtask"
import {saveTaskTool} from "../src/write/saveTask"
import {makeRealWorkspace} from "./helpers/realWorkspace"

describe("save_subtask", () => {
  it("creates a done subtask in one write", async () => {
    const {ctx, changesets} = makeRealWorkspace()
    const {task} = (await saveTaskTool.run({content: "Parent"}, ctx)) as {task: {id: string}}
    const taskId = task.id
    changesets.length = 0

    const result = (await saveSubtaskTool.run({taskId, content: "Step", done: true}, ctx)) as {subtask: {done: boolean}}

    expect(result.subtask.done).toBe(true)
    expect(changesets).toHaveLength(1)
    expect(changesets[0].subtasks?.upserted?.[0]).toMatchObject({content: "Step", done: true})
  })
})
