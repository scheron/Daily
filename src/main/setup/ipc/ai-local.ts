import {ipcMain} from "electron"

import type {AIController} from "@/ai/AIController"
import type {LocalModelId} from "@shared/types/ai"
import type {BrowserWindow} from "electron"

export function setupLocalAiIPC(getAi: () => AIController | null, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle("ai:local-list-models", () => {
    return getAi()?.getModelManager().listModels() ?? []
  })

  ipcMain.handle("ai:local-download-model", async (_event, modelId: LocalModelId) => {
    const ai = getAi()
    if (!ai) return false

    return ai.getModelManager().downloadModel(modelId, (progress) => {
      getMainWindow()?.webContents.send("ai:local-download-progress", progress)
    })
  })

  ipcMain.handle("ai:local-cancel-download", (_event, modelId: LocalModelId) => {
    return getAi()?.getModelManager().cancelDownload(modelId) ?? false
  })

  ipcMain.handle("ai:local-delete-model", (_event, modelId: LocalModelId) => {
    return getAi()?.getModelManager().deleteModel(modelId) ?? false
  })

  ipcMain.handle("ai:local-get-state", () => {
    return getAi()?.getLocalState() ?? {status: "not_installed"}
  })

  ipcMain.handle("ai:local-get-disk-usage", () => {
    return getAi()?.getModelManager().getDiskUsage() ?? {total: 0, models: {}}
  })
}
