import {BrowserWindow, ipcMain} from "electron"

import {isToastMessage} from "@main/utils/toasts/isToastMessage"
import {TOAST_PUBLISH_CHANNEL} from "@shared/constants/toast"

import type {ToastMessage} from "@shared/types/toast"

export function createToastRouter() {
  const pending: ToastMessage[] = []
  let main: {window: BrowserWindow; ready: boolean} | null = null

  function publish(toast: ToastMessage) {
    const maxPendingToasts = 10

    pending.push(toast)
    if (pending.length > maxPendingToasts) pending.shift()
    flush()
  }

  function registerIPC() {
    ipcMain.on(TOAST_PUBLISH_CHANNEL, (event, payload: unknown) => {
      const {sender, senderFrame} = event
      if (sender.isDestroyed() || !senderFrame || senderFrame !== sender.mainFrame || !BrowserWindow.fromWebContents(sender)) return
      if (isToastMessage(payload)) publish(payload)
    })
  }

  function trackMainWindow(window: BrowserWindow) {
    const tracked = {window, ready: false}
    main = tracked

    const {webContents} = window
    webContents.ipc.on("toast:renderer-ready", ({senderFrame}) => {
      if (senderFrame !== webContents.mainFrame) return
      tracked.ready = true
      flush()
    })
    webContents.on("did-start-navigation", ({isMainFrame, isSameDocument}) => {
      if (isMainFrame && !isSameDocument) tracked.ready = false
    })
    webContents.on("render-process-gone", () => {
      tracked.ready = false
    })
    window.on("show", flush)
    window.on("restore", flush)
    window.once("closed", () => {
      if (main === tracked) main = null
    })
  }

  return {publish, registerIPC, trackMainWindow}

  function flush() {
    if (!main?.ready || !pending.length) return
    const {window} = main
    if (window.isDestroyed() || !window.isVisible() || window.isMinimized()) return

    const {webContents} = window
    if (webContents.isDestroyed()) return

    while (pending.length) {
      try {
        webContents.send("toast:show", pending[0])
      } catch {
        main.ready = false
        return
      }

      pending.shift()
    }
  }
}
