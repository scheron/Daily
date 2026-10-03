import {app, ipcMain, Menu, nativeImage, Tray} from "electron"

import {logger} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"
import {updaterController} from "@main/updates/UpdaterController"

import type {MenuItemConstructorOptions} from "electron"

type TrayItem = {
  id: string
  label: string
  /** Shown right-aligned and grey. Display only: nothing is registered. */
  accelerator?: string
  enabled?: boolean
  /** Items sharing a section sit together with no separator; an item without one is its own section. */
  section?: string
  click?: () => void
}

type TrayItemPatch = Partial<Omit<TrayItem, "id">>

export class TrayController {
  private tray: Tray | null = null
  private items: TrayItem[] = this.createDefaultItems()

  get isVisible() {
    return this.tray !== null
  }

  create() {
    if (this.tray) return

    try {
      const iconPath = electronPaths.trayIcon()
      const icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) logger.error(logger.CONTEXT.APP, `The tray icon is missing or unreadable: ${iconPath}`)
      icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      this.tray.setToolTip(app.name)
      this.refresh()
    } catch (error) {
      this.tray = null
      logger.error(logger.CONTEXT.APP, "Failed to create the tray icon", error)
    }
  }

  destroy() {
    if (!this.tray) return

    this.tray.destroy()
    this.tray = null
  }

  /** Adds a menu item above the item with id `beforeId`, or at the end when there is none. */
  addItem(item: TrayItem, beforeId: string) {
    const index = this.items.findIndex((it) => it.id === beforeId)
    this.items.splice(index === -1 ? this.items.length : index, 0, item)
    this.refresh()
  }

  /** Changes a menu item's label, accelerator, enabled state or handler and rebuilds the visible menu. */
  updateItem(id: string, patch: TrayItemPatch) {
    const index = this.items.findIndex((it) => it.id === id)
    if (index === -1) return

    this.items[index] = {...this.items[index], ...patch}
    this.refresh()
  }

  private refresh() {
    if (!this.tray) return

    this.tray.setContextMenu(Menu.buildFromTemplate(toTemplate(this.items)))
  }

  private createDefaultItems(): TrayItem[] {
    return [
      {id: "version", label: `Daily v${app.getVersion()}`, enabled: false},
      {id: "settings", section: "actions", label: "Settings…", click: () => ipcMain.emit("settings:open")},
      {id: "updates", section: "actions", label: "Check for Updates…", click: () => updaterController.checkForUpdate({manual: true})},
      {id: "quit", label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit()},
    ]
  }
}

export const trayController = new TrayController()

function toTemplate(items: TrayItem[]): MenuItemConstructorOptions[] {
  return items.flatMap((item, index) => {
    const entry: MenuItemConstructorOptions = {
      label: item.label,
      enabled: item.enabled ?? true,
      click: item.click,
      ...(item.accelerator ? {accelerator: item.accelerator, registerAccelerator: false} : {}),
    }
    const previous = items[index - 1]
    const startsSection = previous && (previous.section ?? previous.id) !== (item.section ?? item.id)
    return startsSection ? [{type: "separator"}, entry] : [entry]
  })
}
