import {expect, it} from "vitest"

import {makeRealWorkspace} from "../../../../../../packages/tools/tests/helpers/realWorkspace"
import {exerciseStatusContract} from "../../../../../../packages/tools/tests/helpers/statusContract"
import {toModelToolMessage} from "../../../../src/main/ai/tools/format"
import {SHARED_TOOLS} from "../../../../src/main/ai/tools/registry/categories/shared"

import type {StorageController} from "@daily/core"
import type {ToolExecutionContext} from "../../../../src/main/ai/tools/registry/types"

it("the Assistant wrapper enforces the shared workflow and authorship in Normal mode", async () => {
  const {db, core, workStorage} = makeRealWorkspace()
  try {
    expect((await core.settingsService.loadSettings()).appearance.boardMode).toBe("normal")
    const storage = {workStorage} as StorageController
    await exerciseStatusContract(
      async (name, input) => {
        const tool = SHARED_TOOLS.find((candidate) => candidate.name === name)
        expect(tool).toBeDefined()
        const result = await tool!.execute(input, {storage, now: () => new Date(), caller: "in-app"})
        if (!result.success) throw new Error(result.error)
        return result.data
      },
      {kind: "agent", provider: "daily_agent"},
      (request) => workStorage.resolveTaskWorkflowProposal(request),
    )
  } finally {
    db.close()
  }
})

it("the actual model message preserves actionable workflow refusal code and current state", async () => {
  const {db, workStorage} = makeRealWorkspace()
  try {
    const storage = {workStorage} as StorageController
    for (const content of ["Obsolete Assistant guidance 24c8", "Current Assistant guidance ff01"]) {
      const {workspace} = await workStorage.getWorkflowGuidance()
      await workStorage.updateWorkflowGuidance({
        scope: {kind: "workspace"},
        content,
        allowCompletion: false,
        operationId: content,
        expectedRevision: workspace.revision,
      })
    }
    const ctx: ToolExecutionContext = {storage, now: () => new Date(), caller: "in-app"}
    const save = SHARED_TOOLS.find((tool) => tool.name === "save_task")!
    const created = await save.execute({content: "Selected work"}, ctx)
    const {task} = created.data as {task: {id: string}}
    const before = await workStorage.getTaskWorkflow(task.id)
    await workStorage.updateTask(task.id, {content: "Human correction"})
    const current = await workStorage.getTaskWorkflow(task.id)
    const update = SHARED_TOOLS.find((tool) => tool.name === "update_task_workflow")!
    const refused = await update.execute(
      {taskId: task.id, operationId: "stale-model-message", expectedRevision: before.revision, kind: "start", sessionId: "work"},
      ctx,
    )
    expect(JSON.parse(toModelToolMessage(update.name, refused))).toMatchObject({
      success: false,
      error: expect.stringContaining("current workflow"),
      data: {code: "stale_revision", current: {revision: current.revision, task: {content: "Human correction"}}},
    })
    expect(toModelToolMessage(update.name, refused)).not.toContain("Obsolete Assistant guidance 24c8")
    expect(toModelToolMessage(update.name, refused)).toContain("Current Assistant guidance ff01")
  } finally {
    db.close()
  }
})
