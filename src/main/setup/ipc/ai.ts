import {ipcMain} from "electron"

import {logger} from "@/utils/logger"
import {broadcastToWindows} from "@/utils/windows/broadcastToWindows"

import type {AIController} from "@/ai/AIController"
import type {WindowsGetter} from "@/utils/windows/broadcastToWindows"
import type {AIConfig, LocalModelId} from "@shared/types/ai"

export async function setupAiIPC(getAi: () => AIController | null, getWindows: WindowsGetter) {
  ipcMain.handle("ai:check-connection", () => getAi()?.checkConnection() ?? false)
  ipcMain.handle("ai:list-models", () => getAi()?.listModels() ?? [])
  ipcMain.handle("ai:send-message", (_event, message: string) => getAi()?.sendMessage(message))
  ipcMain.handle("ai:cancel", () => getAi()?.cancel())
  ipcMain.handle("ai:clear-history", () => getAi()?.clearHistory())
  ipcMain.handle("ai:update-config", (_event, config: AIConfig) => getAi()?.updateConfig(config))
  ipcMain.handle("ai:confirm-tool-call", (_event, confirmationId: string) => getAi()?.confirmToolCall(confirmationId) ?? false)
  ipcMain.handle("ai:cancel-tool-call", (_event, confirmationId: string) => getAi()?.cancelToolCall(confirmationId) ?? false)
  ipcMain.handle("ai:get-current-session", async () => (await getAi()?.getCurrentSession()) ?? {turns: []})

  ipcMain.handle("ai:local-list-models", async () => (await getAi()?.getLocalModel().listModels()) ?? [])
  ipcMain.handle("ai:local-get-state", async () => (await getAi()?.getLocalState()) ?? {status: "not_installed"})
  ipcMain.handle("ai:local-get-disk-usage", async () => (await getAi()?.getLocalModel().getDiskUsage()) ?? {total: 0, models: {}})
  ipcMain.handle(
    "ai:local-cancel-download",
    async (_event, modelId: LocalModelId) => (await getAi()?.getLocalModel().cancelDownload(modelId)) ?? false,
  )
  ipcMain.handle("ai:local-delete-model", async (_event, modelId: LocalModelId) => (await getAi()?.deleteLocalModel(modelId)) ?? false)
  ipcMain.handle("ai:local-download-model", async (_event, modelId: LocalModelId) => {
    const ai = getAi()
    if (!ai) return false
    logger.info(logger.CONTEXT.AI, "IPC: ai:local-download-model invoked", {modelId})
    let progressTick = 0
    return ai.getLocalModel().downloadModel(modelId, (progress) => {
      progressTick++
      if (progressTick === 1 || progressTick % 200 === 0 || progress.phase === "verifying") {
        const openWindows = Object.entries(getWindows())
          .filter(([, win]) => win && !win.isDestroyed())
          .map(([name]) => name)
        logger.info(logger.CONTEXT.AI, "IPC: forwarding download progress", {
          modelId,
          tick: progressTick,
          phase: progress.phase,
          percent: progress.percent,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          openWindows,
        })
      }
      broadcastToWindows(getWindows, "ai:local-download-progress", progress)
    })
  })

  ipcMain.handle("ai:local-refresh-catalog", async () => {
    const ai = getAi()
    if (!ai) return "failed"
    const result = await ai.getLocalModel().refreshCatalog()
    if (result === "updated") broadcastToWindows(getWindows, "ai:local-catalog-changed", undefined)
    return result
  })
}
