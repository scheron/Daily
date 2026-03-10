import {updaterController} from "@/updates/UpdaterController"

import type {IStorageController} from "@/types/storage"
import type {BrowserWindow} from "electron"

let isUpdateManagerInitialized = false

export function setupUpdateManager(window: BrowserWindow, getStorage: () => IStorageController | null): void {
  updaterController.setStorageController(getStorage)
  updaterController.setMainWindow(window)

  window.webContents.once("did-finish-load", () => {
    updaterController.syncState()
  })

  if (isUpdateManagerInitialized) {
    updaterController.syncState()
    return
  }

  isUpdateManagerInitialized = true
  void updaterController.initialize()
}
