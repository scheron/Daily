import {describe, expect, it, onTestFinished} from "vitest"

import {listTasksTool} from "../src/read/listTasks"
import {saveTaskTool} from "../src/write/saveTask"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {TaskView} from "../src/views"

type TaskPage = {tasks: TaskView[]; total: number; nextCursor: string | null}

describe("list_tasks search", () => {
  it("ranks matching tasks within the selected project and counts all matches before paging", async () => {
    const {db, workStorage, ctx} = makeRealWorkspace()
    onTestFinished(() => db.close())
    const project = (await workStorage.createBranch({name: "Travel"})).branches!.upserted![0]
    const exact = "Предварительная регистрация"
    const fuzzy = "Предварительная регстрация"
    for (let i = 0; i < 2; i++) {
      await saveTaskTool.run({tasks: Array.from({length: 50}, () => ({content: exact}))}, ctx)
    }
    await saveTaskTool.run(
      {
        tasks: [
          {content: exact, projectId: project.id},
          {content: fuzzy, projectId: project.id},
        ],
      },
      ctx,
    )
    const input = {search: "предварительная регистрация", projectId: project.id, limit: 1}

    const first = (await listTasksTool.run(input, {...ctx, searchWorkBudget: 1200})) as TaskPage
    expect(first).toEqual({tasks: [expect.objectContaining({content: exact})], total: 2, nextCursor: expect.any(String)})

    const second = (await listTasksTool.run({...input, cursor: first.nextCursor}, ctx)) as TaskPage
    expect(second).toEqual({tasks: [expect.objectContaining({content: fuzzy})], total: 2, nextCursor: null})

    const allProjects = await listTasksTool.run({search: input.search}, ctx)
    expect(allProjects).toMatchObject({total: 102, nextCursor: expect.any(String)})
  })

  it("searches the trash collection when deleted is true", async () => {
    const {db, workStorage, ctx} = makeRealWorkspace()
    onTestFinished(() => db.close())
    const {tasks} = (await saveTaskTool.run({tasks: [{content: "Verify passport"}, {content: "Find passport"}]}, ctx)) as {tasks: TaskView[]}
    await workStorage.deleteTask(tasks[0].id)

    const found = await listTasksTool.run({search: "passport", deleted: true}, ctx)

    expect(found).toEqual({tasks: [expect.objectContaining({id: tasks[0].id})], total: 1, nextCursor: null})
  })

  it("fails a search when scoring a later candidate exhausts the budget", async () => {
    const {db, ctx} = makeRealWorkspace()
    onTestFinished(() => db.close())
    const search = "passport"
    await saveTaskTool.run({tasks: [{content: search}, {content: "Get the pasport before your departure"}]}, ctx)

    await expect(listTasksTool.run({search, limit: 1}, {...ctx, searchWorkBudget: 150})).rejects.toMatchObject({code: "SEARCH_BUDGET_EXCEEDED"})
  })
})
