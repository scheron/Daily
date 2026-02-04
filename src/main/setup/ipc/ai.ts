import {ipcMain} from "electron"

import {LogContext, logger} from "@/utils/logger"

import {aiService} from "@/ai/providers/ClientController"

import type {StorageController} from "@/storage/StorageController"
import type {BrowserWindow} from "electron"

export function setupAiIPC(getStorage: () => StorageController, getMainWindow: () => BrowserWindow | null): void {
  const storage = getStorage()

  aiService.setStorage(storage)

  storage.loadSettings().then((settings) => {
    if (settings.ai) {
      aiService.updateConfig(settings.ai)
      logger.info(LogContext.AI, "Loaded AI config from settings", {provider: settings.ai.provider, model: settings.ai.model})
    }
  })

  // Check Ollama connection
  ipcMain.handle("ai:check-connection", async () => {
    try {
      return await aiService.checkConnection()
    } catch (error) {
      logger.error(LogContext.AI, "Failed to check Ollama connection", error)
      return false
    }
  })

  // List available models
  ipcMain.handle("ai:list-models", async () => {
    try {
      return await aiService.listModels()
    } catch (error) {
      logger.error(LogContext.AI, "Failed to list models", error)
      return []
    }
  })

  // Send message to AI
  ipcMain.handle("ai:send-message", async (_event, message: string) => {
    try {
      const mainWindow = getMainWindow()
      return await aiService.sendMessage(message, mainWindow ?? undefined)
    } catch (error) {
      logger.error(LogContext.AI, "Failed to send message", error)
      return {success: false, error: error instanceof Error ? error.message : String(error)}
    }
  })

  // Cancel current request
  ipcMain.handle("ai:cancel", () => {
    aiService.cancel()
    return true
  })

  // Clear conversation history
  ipcMain.handle("ai:clear-history", () => {
    aiService.clearHistory()
    return true
  })

  // Update AI config and save to settings
  ipcMain.handle("ai:update-config", async (_event, config: Partial<AiConfig>) => {
    aiService.updateConfig(config)
    const newConfig = aiService.getConfig()

    // Save to persistent settings
    try {
      await storage.saveSettings({ai: newConfig})
      logger.debug(LogContext.AI, "Saved AI config to settings")
    } catch (error) {
      logger.error(LogContext.AI, "Failed to save AI config to settings", error)
    }

    return newConfig
  })

  // Get current AI config
  ipcMain.handle("ai:get-config", () => {
    return aiService.getConfig()
  })
}
