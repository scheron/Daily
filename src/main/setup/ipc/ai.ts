import {ipcMain} from "electron"

import type {AIController} from "@/ai/AIController"
import type {AIConfig} from "@shared/types/ai"

export async function setupAiIPC(getAi: () => AIController | null) {
  ipcMain.handle("ai:check-connection", () => getAi()?.checkConnection() ?? false)
  ipcMain.handle("ai:list-models", () => getAi()?.listModels() ?? [])
  ipcMain.handle("ai:send-message", (_event, message: string) => getAi()?.sendMessage(message))
  ipcMain.handle("ai:cancel", () => getAi()?.cancel())
  ipcMain.handle("ai:clear-history", () => getAi()?.clearHistory())
  ipcMain.handle("ai:update-config", (_event, config: AIConfig) => getAi()?.updateConfig(config))
}
