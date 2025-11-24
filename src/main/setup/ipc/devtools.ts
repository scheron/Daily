import {fsPaths} from "@/config"
import {getDB} from "@/storage/database"
import {LogContext, logger} from "@/utils/logger"
import {createDevToolsWindow} from "@/windows"
import {BrowserWindow, ipcMain} from "electron"

export function setupDevToolsIPC(
  getMainWindow: () => BrowserWindow | null,
  getDevToolsWindow: () => BrowserWindow | null,
  setDevToolsWindow: (window: BrowserWindow | null) => void,
) {
  ipcMain.on("devtools:open", () => {
    const existing = getDevToolsWindow()

    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }

    const newDevToolsWindow = createDevToolsWindow()
    setDevToolsWindow(newDevToolsWindow)

    newDevToolsWindow.on("closed", () => setDevToolsWindow(null))
  })

  ipcMain.on("devtools:close", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow && senderWindow !== getMainWindow?.()) {
      senderWindow.close()

      if (senderWindow === getDevToolsWindow()) {
        setDevToolsWindow(null)
      }
    }
  })
}

let dbInstance: PouchDB.Database | null = null

export async function setupDbViewerIPC(): Promise<void> {
  const dbPath = fsPaths.dbPath()

  const db = await getDB(dbPath)
  dbInstance = db

  ipcMain.handle("db-viewer:get-docs", async (_event, type?: string, limit = 100) => {
    if (!dbInstance) {
      throw new Error("DB not initialized")
    }

    try {
      if (type) {
        const result = await dbInstance.find({
          selector: {type},
          limit: Number.isFinite(limit) ? limit : 100,
        })

        return {
          ok: true,
          type,
          total: result.docs.length,
          docs: result.docs,
        }
      } else {
        const result = await dbInstance.allDocs({
          include_docs: true,
          limit: Number.isFinite(limit) ? limit : 100,
        })

        return {
          ok: true,
          type: null,
          total: result.rows.length,
          docs: result.rows.map((r) => r.doc),
        }
      }
    } catch (error) {
      logger.error(LogContext.DB, "Failed to get docs", error)
      throw error
    }
  })

  ipcMain.handle("db-viewer:get-doc", async (_event, id: string) => {
    if (!dbInstance) {
      throw new Error("DB not initialized")
    }

    try {
      const doc = await dbInstance.get(id, {attachments: true})
      return doc
    } catch (error) {
      logger.error(LogContext.DB, `Failed to get doc: ${id}`, error)
      throw error
    }
  })

  logger.debug(LogContext.IPC, "DB Viewer IPC handlers registered")
}
