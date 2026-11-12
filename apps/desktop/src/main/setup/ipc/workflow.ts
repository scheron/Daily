import {ipcMain} from "electron"

import type {IStorageController} from "@daily/core"
import type {TaskWorkflowState, WorkflowGuidanceDocument} from "@daily/protocol"
import type {GuidanceUpdate, ProposalResolution, WorkflowResult} from "@shared/types/workflow"

export function setupWorkflowIPC(getStorage: () => IStorageController | null) {
  ipcMain.handle("workflow:get-guidance", (_event, projectId?: string) => run((storage) => storage.getWorkflowGuidance(projectId)))
  ipcMain.handle("workflow:save-guidance", (_event, update: GuidanceUpdate) => run((storage) => storage.updateWorkflowGuidance(update)))
  ipcMain.handle("workflow:get-task", (_event, taskId: string) => run((storage) => storage.getTaskWorkflow(taskId)))
  ipcMain.handle("workflow:resolve-proposal", (_event, resolution: ProposalResolution) =>
    run(async (storage) => {
      await storage.resolveTaskWorkflowProposal(resolution)
      return storage.getTaskWorkflow(resolution.taskId)
    }),
  )

  async function run<T>(action: (storage: IStorageController) => Promise<T>): Promise<WorkflowResult<T>> {
    try {
      const storage = getStorage()
      if (!storage) return {ok: false, code: "unavailable", message: "Daily is still opening. Try again shortly.", current: null}
      return {ok: true, value: await action(storage)}
    } catch (error) {
      const failure = error as {
        code?: unknown
        message?: unknown
        current?: TaskWorkflowState | null
        currentGuidance?: WorkflowGuidanceDocument | null
      }
      return {
        ok: false,
        code: typeof failure?.code === "string" ? failure.code : "unknown",
        message: typeof failure?.message === "string" ? failure.message : "The change could not be saved. Try again.",
        current: failure?.current ?? null,
        ...(failure?.currentGuidance ? {currentGuidance: failure.currentGuidance} : {}),
      }
    }
  }
}
