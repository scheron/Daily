import {app} from "electron"

import {createHotkeyRequestHandler, unregisterHotkey} from "@main/modules/quickTask/hotkey"
import {StdioChannel} from "@main/modules/quickTask/StdioChannel"
import {setupQuickTaskPanelIPC} from "@main/setup/ipc/quickTaskPanel"
import {createQuickTaskWindow, toggleQuickTask} from "@main/windows/quickTask.window"
import {createQuickTaskMenuWindow} from "@main/windows/quickTaskMenu.window"
import {PROCESS_READY_EVENT, QUICK_TASK_FORWARDED_EVENTS} from "@shared/constants/quickTask"
import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"

import type {BrowserWindow} from "electron"

type ChannelStreams = {
  stdin: Pick<NodeJS.ReadStream, "setEncoding" | "on">
  stdout: Pick<NodeJS.WriteStream, "write" | "on">
}

/**
 * Runs this process as the Quick task process: it owns the shortcut and the panel and menu windows, and gets all data from Daily over stdio.
 * It quits quietly when Daily closes the channel, whichever way it closes.
 * @param streams - the channel to Daily; the process's own stdin and stdout by default
 */
export function setupQuickTaskWindow({stdin, stdout}: ChannelStreams = process) {
  console.log = console.error

  let panel: BrowserWindow | null = null
  let menu: BrowserWindow | null = null

  const channel = new StdioChannel((line) => stdout.write(line), {
    onRequest: createHotkeyRequestHandler(onHotkey),
    onEvent: (name, args) => {
      if (!(QUICK_TASK_FORWARDED_EVENTS as readonly string[]).includes(name)) return
      for (const win of [panel, menu]) if (win && !win.isDestroyed()) win.webContents.send(name, ...args)
    },
    onInvalid: (line) => console.error("[quick-task] not a message:", line.slice(0, 200)),
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
    setupQuickTaskPanelIPC({
      getPanel: () => panel,
      getMenu: () => menu,
      forward: (name, args) => channel.request(name, args),
    })
    channel.emit(PROCESS_READY_EVENT)
  })

  function onChannelClosed() {
    channel.close(new QuickTaskError(QuickTaskErrorCode.ChannelClosed, "Daily closed the channel"))
    app.quit()
  }

  function onHotkey() {
    toggleQuickTask(ensureWindows())
  }

  function ensureWindows(): BrowserWindow {
    if (!panel || panel.isDestroyed()) {
      const created = createQuickTaskWindow()
      panel = created
      created.on("closed", () => {
        if (panel === created) panel = null
        const menuWindow = menu
        menu = null
        if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy()
      })
    }

    if (!menu || menu.isDestroyed()) menu = createQuickTaskMenuWindow(panel)
    return panel
  }
}
