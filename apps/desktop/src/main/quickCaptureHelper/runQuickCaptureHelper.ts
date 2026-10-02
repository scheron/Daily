import {app} from "electron"

import {createQuickCaptureWindow, toggleQuickCapture} from "@main/windows/quickCapture.window"
import {createQuickCaptureMenuWindow} from "@main/windows/quickCaptureMenu.window"
import {QuickCaptureHelperError} from "@shared/errors/quickCapture/QuickCaptureHelperError"
import {QuickCaptureHelperErrorCode} from "@shared/errors/quickCapture/QuickCaptureHelperErrorCode"
import {HelperChannel} from "./HelperChannel"
import {setupHelperIpc} from "./helperIpc"
import {HELPER_READY_EVENT, QUICK_CAPTURE_FORWARDED_EVENTS} from "./helperProtocol"
import {unregisterHotkey} from "./hotkey"
import {createHotkeyRequestHandler} from "./hotkeyRequests"

import type {BrowserWindow} from "electron"

type HelperStreams = {
  stdin: Pick<NodeJS.ReadStream, "setEncoding" | "on">
  stdout: Pick<NodeJS.WriteStream, "write" | "on">
}

/**
 * Runs this process as the quick-capture helper: it owns the shortcut and the panel and menu windows, and gets all data from Daily over stdio.
 * It quits quietly when Daily closes the channel, whichever way it closes.
 * @param streams - the channel to Daily; the process's own stdin and stdout by default
 */
export function runQuickCaptureHelper({stdin, stdout}: HelperStreams = process) {
  console.log = console.error

  let panel: BrowserWindow | null = null
  let menu: BrowserWindow | null = null

  const channel = new HelperChannel((line) => stdout.write(line), {
    onRequest: createHotkeyRequestHandler(onHotkey),
    onEvent: (name, args) => {
      if (!(QUICK_CAPTURE_FORWARDED_EVENTS as readonly string[]).includes(name)) return
      for (const win of [panel, menu]) if (win && !win.isDestroyed()) win.webContents.send(name, ...args)
    },
    onInvalid: (line) => console.error("[quick-capture-helper] not a message:", line.slice(0, 200)),
  })

  stdin.setEncoding("utf8")
  stdin.on("data", (chunk: string) => channel.receive(chunk))
  stdin.on("end", onChannelClosed)
  stdout.on("error", onChannelClosed)

  app.on("window-all-closed", () => undefined)
  app.on("will-quit", unregisterHotkey)

  app.whenReady().then(() => {
    app.dock?.hide()
    ensureWindows()
    setupHelperIpc({
      getPanel: () => panel,
      getMenu: () => menu,
      forward: (name, args) => channel.request(name, args),
    })
    channel.emit(HELPER_READY_EVENT)
  })

  function onChannelClosed() {
    channel.close(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.ChannelClosed, "Daily closed the channel"))
    app.quit()
  }

  function onHotkey() {
    toggleQuickCapture(ensureWindows())
  }

  function ensureWindows(): BrowserWindow {
    if (!panel || panel.isDestroyed()) {
      const created = createQuickCaptureWindow()
      panel = created
      created.on("closed", () => {
        if (panel === created) panel = null
        const menuWindow = menu
        menu = null
        if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy()
      })
    }

    if (!menu || menu.isDestroyed()) menu = createQuickCaptureMenuWindow(panel)
    return panel
  }
}
