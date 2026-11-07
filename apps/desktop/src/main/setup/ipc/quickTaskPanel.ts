import {ipcMain} from "electron"

import {isToastMessage} from "@main/utils/toasts/isToastMessage"
import {hideQuickTask, resizeQuickTask} from "@main/windows/quickTask.window"
import {placeQuickTaskMenu, setQuickTaskMenu} from "@main/windows/quickTaskMenu.window"
import {QUICK_TASK_FORWARDED_CHANNELS} from "@shared/constants/quickTask"
import {TOAST_PUBLISH_CHANNEL} from "@shared/constants/toast"
import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"

import type {QuickTaskMenu} from "@shared/types/quickTask"
import type {ToastMessage} from "@shared/types/toast"
import type {BrowserWindow, IpcMainEvent, IpcMainInvokeEvent} from "electron"

type QuickTaskPanelIPCOptions = {
  getPanel: () => BrowserWindow | null
  getMenu: () => BrowserWindow | null
  forward: (channel: string, args: unknown[]) => Promise<unknown>
  onToast: (toast: ToastMessage) => void
}

const MENU_FORWARDED_CHANNEL = "settings:load"

export function setupQuickTaskPanelIPC({getPanel, getMenu, forward, onToast}: QuickTaskPanelIPCOptions) {
  const isFrom = (win: BrowserWindow | null, event: IpcMainEvent | IpcMainInvokeEvent) =>
    !!win && !win.isDestroyed() && win.webContents === event.sender
  const isPanel = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(getPanel(), event)
  const isMenu = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(getMenu(), event)

  ipcMain.on(TOAST_PUBLISH_CHANNEL, (event, payload: unknown) => {
    if ((isPanel(event) || isMenu(event)) && isToastMessage(payload)) onToast(payload)
  })

  ipcMain.on("quick-task:hide", (event) => {
    const panelWindow = getPanel()
    if (panelWindow && isPanel(event)) hideQuickTask(panelWindow)
  })

  ipcMain.on("quick-task:resize", (event, height: number) => {
    const panelWindow = getPanel()
    if (panelWindow && isPanel(event)) resizeQuickTask(panelWindow, height)
  })

  ipcMain.on("quick-task:set-menu", (event, menu: unknown) => {
    if (!isPanel(event) || (menu !== null && !isMenuPayload(menu))) return

    const panelWindow = getPanel()
    const menuWindow = getMenu()
    if (panelWindow && menuWindow) setQuickTaskMenu(menuWindow, panelWindow, menu)
  })

  ipcMain.on("quick-task-menu:resize", (event, height: unknown) => {
    if (!isMenu(event) || typeof height !== "number" || !Number.isFinite(height)) return

    const panelWindow = getPanel()
    const menuWindow = getMenu()
    if (panelWindow && menuWindow) placeQuickTaskMenu(menuWindow, panelWindow, height)
  })

  ipcMain.on("quick-task-menu:pick", (event, index: unknown) => {
    if (!isMenu(event) || !Number.isInteger(index) || (index as number) < 0) return

    getPanel()?.webContents.send("quick-task:menu-pick", index)
  })

  for (const channel of QUICK_TASK_FORWARDED_CHANNELS) {
    ipcMain.handle(channel, (event, ...args) => {
      const isAllowed = isPanel(event) || (channel === MENU_FORWARDED_CHANNEL && isMenu(event))
      if (!isAllowed) {
        throw new QuickTaskError(QuickTaskErrorCode.ChannelNotAvailable, `Channel ${channel} is not available to this window`)
      }
      return forward(channel, args)
    })
  }
}

function isMenuPayload(value: unknown): value is QuickTaskMenu {
  if (typeof value !== "object" || value === null) return false

  const {rows, selected, caretX} = value as Record<string, unknown>
  return (
    Array.isArray(rows) &&
    rows.every(isMenuRow) &&
    typeof selected === "number" &&
    Number.isInteger(selected) &&
    selected >= 0 &&
    typeof caretX === "number" &&
    Number.isFinite(caretX)
  )
}

function isMenuRow(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false

  const {label, icon, color, tone} = value as Record<string, unknown>
  return (
    typeof label === "string" &&
    (icon === undefined || typeof icon === "string") &&
    (color === undefined || typeof color === "string") &&
    (tone === undefined || tone === "remove")
  )
}
