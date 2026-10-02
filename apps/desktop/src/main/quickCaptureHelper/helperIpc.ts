import {ipcMain} from "electron"

import {hideQuickCapture, resizeQuickCapture} from "@main/windows/quickCapture.window"
import {placeQuickCaptureMenu, setQuickCaptureMenu} from "@main/windows/quickCaptureMenu.window"
import {QuickCaptureHelperError} from "@shared/errors/quickCapture/QuickCaptureHelperError"
import {QuickCaptureHelperErrorCode} from "@shared/errors/quickCapture/QuickCaptureHelperErrorCode"
import {QUICK_CAPTURE_FORWARDED_CHANNELS} from "./helperProtocol"

import type {QuickCaptureMenu} from "@shared/types/quickCapture"
import type {BrowserWindow, IpcMainEvent, IpcMainInvokeEvent} from "electron"

type HelperIpcOptions = {
  getPanel: () => BrowserWindow | null
  getMenu: () => BrowserWindow | null
  forward: (channel: string, args: unknown[]) => Promise<unknown>
}

const MENU_FORWARDED_CHANNEL = "settings:load"

/** Registers what the panel and menu renderers call in the helper process. Each channel answers only the window it is for: the panel for data, hide, resize and the menu content, the menu window for its placement, picks and loading settings. */
export function setupHelperIpc({getPanel, getMenu, forward}: HelperIpcOptions) {
  const isFrom = (win: BrowserWindow | null, event: IpcMainEvent | IpcMainInvokeEvent) =>
    !!win && !win.isDestroyed() && win.webContents === event.sender
  const isPanel = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(getPanel(), event)
  const isMenu = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(getMenu(), event)

  ipcMain.on("quick-capture:hide", (event) => {
    const panelWindow = getPanel()
    if (panelWindow && isPanel(event)) hideQuickCapture(panelWindow)
  })

  ipcMain.on("quick-capture:resize", (event, height: number) => {
    const panelWindow = getPanel()
    if (panelWindow && isPanel(event)) resizeQuickCapture(panelWindow, height)
  })

  ipcMain.on("quick-capture:set-menu", (event, menu: unknown) => {
    if (!isPanel(event) || (menu !== null && !isMenuPayload(menu))) return

    const panelWindow = getPanel()
    const menuWindow = getMenu()
    if (panelWindow && menuWindow) setQuickCaptureMenu(menuWindow, panelWindow, menu)
  })

  ipcMain.on("quick-capture-menu:resize", (event, height: unknown) => {
    if (!isMenu(event) || typeof height !== "number" || !Number.isFinite(height)) return

    const panelWindow = getPanel()
    const menuWindow = getMenu()
    if (panelWindow && menuWindow) placeQuickCaptureMenu(menuWindow, panelWindow, height)
  })

  ipcMain.on("quick-capture-menu:pick", (event, index: unknown) => {
    if (!isMenu(event) || !Number.isInteger(index) || (index as number) < 0) return

    getPanel()?.webContents.send("quick-capture:menu-pick", index)
  })

  for (const channel of QUICK_CAPTURE_FORWARDED_CHANNELS) {
    ipcMain.handle(channel, (event, ...args) => {
      const isAllowed = isPanel(event) || (channel === MENU_FORWARDED_CHANNEL && isMenu(event))
      if (!isAllowed) {
        throw new QuickCaptureHelperError(QuickCaptureHelperErrorCode.ChannelNotAvailable, `Channel ${channel} is not available to this window`)
      }
      return forward(channel, args)
    })
  }
}

function isMenuPayload(value: unknown): value is QuickCaptureMenu {
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
