import {BrowserWindow} from "electron"

import type {ID, IStorageController, StorageSyncEvent, Task, TaskEvent} from "../../types.js"

let getMainWindow: () => BrowserWindow | null = () => null

export function setupStorageEvents(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
}

export async function syncStorage(storage: IStorageController): Promise<void> {
  try {
    console.log("🔄 Storage sync triggered")
    notifyStorageSyncStatus(true)

    await storage.syncStorage()
  } catch (error) {
    console.error("❌ Storage sync error:", error)
  } finally {
    notifyStorageSyncStatus(false)
  }
}

export function notifyStorageChange(type: StorageSyncEvent["type"]) {
  const win = getMainWindow()
  if (!win) return
  console.log("notifyStorageChange", type)

  win.webContents.send("storage:sync", {type})
}

export function notifyTaskEvent(event: TaskEvent["type"], taskOrId: Task | ID) {
  const win = getMainWindow()
  if (!win) return

  if (event === "saved") win.webContents.send("task:saved", taskOrId)
  else win.webContents.send("task:deleted", taskOrId)

  const timerWindows = BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed())

  timerWindows.forEach((timerWin) => {
    if (event === "saved") timerWin.webContents.send("task:saved", taskOrId)
    else timerWin.webContents.send("task:deleted", taskOrId)
  })
}

export async function notifyStorageSyncStatus(isSyncing: boolean) {
  const win = getMainWindow()
  if (!win) return

  if (isSyncing) {
    win.webContents.send("storage:is-syncing", {isSyncing})
  } else {
    setTimeout(() => {
      win.webContents.send("storage:is-syncing", {isSyncing})
    }, 100)
  }
}
