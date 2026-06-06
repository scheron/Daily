import {randomBytes} from "node:crypto"
import {ipcMain} from "electron"

import {logger} from "@/utils/logger"

import {MCP_TOKEN_BYTES} from "@/mcp/constants"

import type {McpServer} from "@/mcp/McpServer"
import type {StorageController} from "@/storage/StorageController"
import type {McpSettings} from "@shared/types/storage"
import type {BrowserWindow} from "electron"

export function setupMcpIPC(
  getServer: () => McpServer | null,
  getStorage: () => StorageController | null,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("mcp:get-status", () => getServer()?.status() ?? {state: "stopped"})

  ipcMain.handle("mcp:get-config", async () => {
    const settings = await getStorage()?.loadSettings()
    return settings?.mcp ?? {enabled: false, host: "127.0.0.1", port: 7878, token: ""}
  })

  ipcMain.handle("mcp:set-config", async (_e, partial: Partial<McpSettings>) => {
    const storage = getStorage()
    const server = getServer()
    if (!storage || !server) return {state: "stopped"}

    const current = (await storage.loadSettings()).mcp
    const merged: McpSettings = {
      enabled: partial.enabled ?? current.enabled,
      host: partial.host ?? current.host,
      port: partial.port ?? current.port,
      token: partial.token ?? current.token,
    }

    if (merged.enabled && !merged.token) merged.token = generateToken()

    await storage.saveSettings({mcp: merged})

    if (merged.enabled) {
      await server.start(merged)
    } else {
      await server.stop()
    }
    return server.status()
  })

  ipcMain.handle("mcp:rotate-token", async () => {
    const storage = getStorage()
    const server = getServer()
    if (!storage || !server) throw new Error("Storage or MCP server unavailable")

    const next = generateToken()
    const current = (await storage.loadSettings()).mcp
    await storage.saveSettings({mcp: {...current, token: next}})
    server.rotateToken(next)

    logger.info(logger.CONTEXT.MCP, "MCP token rotated")
    return {token: next}
  })

  void getMainWindow
}

function generateToken(): string {
  return `daily_${randomBytes(MCP_TOKEN_BYTES).toString("base64url")}`
}
