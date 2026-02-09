import {ipcMain} from "electron"

import type {AIController} from "@/ai/AIController"
import type {AIConfig, LocalModelId} from "@shared/types/ai"
import type {BrowserWindow} from "electron"

export async function setupAiIPC(getAi: () => AIController | null, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle("ai:check-connection", () => getAi()?.checkConnection() ?? false)
  ipcMain.handle("ai:list-models", () => getAi()?.listModels() ?? [])
  ipcMain.handle("ai:send-message", (_event, message: string) => getAi()?.sendMessage(message))
  ipcMain.handle("ai:cancel", () => getAi()?.cancel())
  ipcMain.handle("ai:clear-history", () => getAi()?.clearHistory())
  ipcMain.handle("ai:update-config", (_event, config: AIConfig) => getAi()?.updateConfig(config))

  ipcMain.handle("ai:local-list-models", () => getAi()?.getLocalModel().listModels() ?? [])
  ipcMain.handle("ai:local-get-state", () => getAi()?.getLocalState() ?? {status: "not_installed"})
  ipcMain.handle("ai:local-get-disk-usage", () => getAi()?.getLocalModel().getDiskUsage() ?? {total: 0, models: {}})
  ipcMain.handle("ai:local-cancel-download", (_event, modelId: LocalModelId) => getAi()?.getLocalModel().cancelDownload(modelId) ?? false)
  ipcMain.handle("ai:local-delete-model", (_event, modelId: LocalModelId) => getAi()?.getLocalModel().deleteModel(modelId) ?? false)
  ipcMain.handle("ai:local-download-model", async (_event, modelId: LocalModelId) => {
    const ai = getAi()
    if (!ai) return false
    return ai.getLocalModel().downloadModel(modelId, (progress) => getMainWindow()?.webContents.send("ai:local-download-progress", progress))
  })
}
