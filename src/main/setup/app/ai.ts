import {ipcMain} from "electron"

import {LogContext, logger} from "@/utils/logger"

import {AIService} from "@/ai/AiService"

import type {StorageController} from "@/storage/StorageController"
import type {AIConfig} from "@shared/types/ai"
import type {BrowserWindow} from "electron"

export async function setupAiIPC(getStorage: () => StorageController | null, getMainWindow: () => BrowserWindow | null) {
  const storage = getStorage()
  const aiService = new AIService()

  if (storage) {
    aiService.setStorage(storage)
  }

  const settings = await storage?.loadSettings()

  if (settings?.ai) {
    aiService.updateConfig(settings.ai)
    logger.info(LogContext.AI, "Loaded AI config from settings", settings.ai)
  }

  ipcMain.handle("ai:check-connection", async () => {
    try {
      return await aiService.checkConnection()
    } catch (error) {
      logger.error(LogContext.AI, "Failed to check Ollama connection", error)
      return false
    }
  })

  ipcMain.handle("ai:list-models", async () => {
    try {
      return await aiService.listModels()
    } catch (error) {
      logger.error(LogContext.AI, "Failed to list models", error)
      return []
    }
  })

  ipcMain.handle("ai:send-message", async (_event, message: string) => {
    try {
      const mainWindow = getMainWindow()
      return await aiService.sendMessage(message, mainWindow)
    } catch (error) {
      logger.error(LogContext.AI, "Failed to send message", error)
      return {success: false, error: error instanceof Error ? error.message : String(error)}
    }
  })
  ipcMain.handle("ai:cancel", () => aiService.cancel())
  ipcMain.handle("ai:clear-history", () => aiService.clearHistory())

  ipcMain.handle("ai:get-config", () => aiService.getConfig())
  ipcMain.handle("ai:update-config", async (_event, config: Partial<AIConfig>) => {
    aiService.updateConfig(config)
    const newConfig = aiService.getConfig()

    try {
      await storage?.saveSettings({ai: newConfig})
      logger.debug(LogContext.AI, "Saved AI config to settings")
    } catch (error) {
      logger.error(LogContext.AI, "Failed to save AI config to settings", error)
    }

    return newConfig
  })
}
