import {afterEach, describe, expect, it} from "vitest"

import {ToolErrorCode} from "../src/errors/ToolErrorCode"
import {saveTaskTool} from "../src/write/saveTask"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {TaskDetailView} from "../src/views"

describe("save_task — status and schedule validation", () => {
  let db: {close(): void} | undefined

  afterEach(() => {
    db?.close()
  })

  it("refuses backlog combined with a scheduled date or time on create and update", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    const created = (await saveTaskTool.run({content: "Existing", status: "todo", date: "2026-11-24"}, ctx)) as {task: TaskDetailView}

    await expect(saveTaskTool.run({content: "Bad create", status: "backlog", date: "2026-11-24"}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
    await expect(saveTaskTool.run({id: created.task.id, status: "backlog", date: "2026-11-24"}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
    await expect(saveTaskTool.run({id: created.task.id, status: "backlog", time: "10:00"}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
  })

  it("refuses date: null combined with a status that requires a scheduled day", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    const created = (await saveTaskTool.run({content: "Existing", status: "ready_for_agent", date: null}, ctx)) as {task: TaskDetailView}

    await expect(saveTaskTool.run({content: "Bad create", status: "in_progress", date: null}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
    await expect(saveTaskTool.run({id: created.task.id, status: "in_progress", date: null}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
    await expect(saveTaskTool.run({id: created.task.id, status: "todo", date: null}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
  })

  it("refuses date: null combined with a time", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    await expect(saveTaskTool.run({content: "Bad time", date: null, time: "09:30"}, ctx)).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
    })
  })

  it("schedules an undated ready_for_agent task for today when moved to in_progress without a date", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    const ready = (await saveTaskTool.run({content: "Planned task", status: "ready_for_agent", date: null}, ctx)) as {task: TaskDetailView}
    expect(ready.task.scheduled).toBeNull()

    const started = (await saveTaskTool.run({id: ready.task.id, status: "in_progress"}, ctx)) as {task: TaskDetailView}
    expect(started.task).toMatchObject({status: "in_progress", scheduled: {date: ctx.clock.today()}})
  })
})
