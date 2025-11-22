import {BrowserWindow, ipcMain} from "electron"

import type {PartialDeep} from "type-fest"
import type {ISODate, IStorageController, Tag, Task} from "../../types.js"

import {fsPaths} from "../../config.js"
import {getDB} from "../storage/database.js"
import {syncStorage} from "../storage/events.js"
import {createDevToolsWindow, createTimerWindow} from "../windows.js"

export function setupStorageIPC(storage: IStorageController): void {
  if (!storage) throw new Error("Storage is not initialized")

  ipcMain.handle("load-settings", (_e) => storage.loadSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => storage.saveSettings(newSettings))

  ipcMain.handle("get-days", (_e, params?: {from?: ISODate; to?: ISODate}) => storage.getDays(params))
  ipcMain.handle("get-day", (_e, date: ISODate) => storage.getDay(date))

  ipcMain.handle("get-task-list", (_e, params?: {from?: ISODate; to?: ISODate}) => storage.getTaskList(params))
  ipcMain.handle("get-task", (_e, id: Task["id"]) => storage.getTask(id))
  ipcMain.handle("update-task", (_e, id: Task["id"], updates: PartialDeep<Task>) => storage.updateTask(id, updates))
  ipcMain.handle("create-task", (_e, task: Task) => storage.createTask(task))
  ipcMain.handle("delete-task", (_e, id: Task["id"]) => storage.deleteTask(id))

  ipcMain.handle("get-tag-list", () => storage.getTagList())
  ipcMain.handle("get-tag", (_e, name: Tag["name"]) => storage.getTag(name))
  ipcMain.handle("update-tag", (_e, name: Tag["name"], tag: Tag) => storage.updateTag(name, tag))
  ipcMain.handle("create-tag", (_e, tag: Tag) => storage.createTag(tag))
  ipcMain.handle("delete-tag", (_e, name: Tag["name"]) => storage.deleteTag(name))

  ipcMain.handle("add-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => storage.addTaskTags(taskId, tagNames))
  ipcMain.handle("remove-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => storage.removeTaskTags(taskId, tagNames))

  ipcMain.handle("save-file", (_e, filename: string, data: any) => storage.saveFile(filename, Buffer.isBuffer(data) ? data : Buffer.from(data)))
  ipcMain.handle("delete-file", (_e, filename: string) => storage.deleteFile(filename))
  ipcMain.handle("get-file-path", (_e, id: string) => storage.getFilePath(id))

  ipcMain.handle("sync-storage", async (_e) => {
    try {
      await syncStorage(storage)
      return true
    } catch (error) {
      console.error("Failed to sync storage:", error)
      return false
    }
  })
}

export function setupWindowIPC(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on("window:minimize", () => getMainWindow()?.minimize())
  ipcMain.on("window:maximize", () => {
    const mainWindow = getMainWindow()
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on("window:close", () => getMainWindow()?.close())
}

export function setupTimerIPC(
  getMainWindow: () => BrowserWindow | null,
  getTimerWindow: () => BrowserWindow | null,
  setTimerWindow: (window: BrowserWindow | null) => void,
) {
  ipcMain.on("window:open-timer", (_e, taskId: Task["id"]) => {
    const existingTimer = getTimerWindow()

    if (existingTimer && !existingTimer.isDestroyed()) {
      existingTimer.webContents.send("timer:refresh-timer", taskId)
      existingTimer.show()
      existingTimer.focus()
      return
    }

    const newTimerWindow = createTimerWindow(taskId)
    setTimerWindow(newTimerWindow)

    newTimerWindow.on("closed", () => setTimerWindow(null))
    newTimerWindow.once("ready-to-show", () => newTimerWindow.show())
  })

  ipcMain.on("window:close-timer", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow && senderWindow !== getMainWindow?.()) {
      senderWindow.close()

      if (senderWindow === getTimerWindow()) {
        setTimerWindow(null)
      }
    }
  })
}

export function setupMenuIPC(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on("menu:new-task", () => getMainWindow()?.webContents.send("new-task"))
  ipcMain.on("menu:toggle-sidebar", () => getMainWindow()?.webContents.send("toggle-sidebar"))
  ipcMain.on("menu:devtools", () => ipcMain.emit("devtools:open"))
}

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
      console.error("❌ Failed to get docs:", error)
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
      console.error("❌ Failed to get doc:", id, error)
      throw error
    }
  })

  console.log("🔍 DB Viewer IPC handlers registered")
}
