import {app, ipcMain, Menu} from "electron"

import {ShortcutsMap} from "@shared/constants/shortcuts"

import {ENV} from "@/config"
import {updaterController} from "@/updates/UpdaterController"

import type {BrowserWindow, MenuItemConstructorOptions} from "electron"

export function setupMenu(getMainWindow: () => BrowserWindow | null): void {
  let template: MenuItemConstructorOptions[]

  const mainWindow = getMainWindow()
  if (!mainWindow) return

  if (process.platform === "darwin") {
    template = createMacMenu(mainWindow)
  } else {
    template = createWindowsMenu(mainWindow)
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createMacMenu(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  const tasksMenu = createTasksMenu(mainWindow)

  return [
    {
      label: app.name,
      submenu: [
        {
          label: "About Daily",
          click: () => ipcMain.emit("about:open"),
        },
        {
          label: "Check for Updates...",
          click: () => updaterController.checkForUpdate({manual: true}),
        },
        {
          label: ShortcutsMap["ui:open-settings-panel"].label,
          accelerator: ShortcutsMap["ui:open-settings-panel"].accelerator,
          click: () => ipcMain.emit("settings:open"),
        },
        {type: "separator"},
        {role: "hide"},
        {role: "hideOthers"},
        {role: "unhide"},
        {type: "separator"},
        {role: "quit"},
      ],
    },
    {
      label: "Tasks",
      submenu: tasksMenu,
    },
    {
      label: "Edit",
      submenu: [
        {role: "undo"},
        {role: "redo"},
        {type: "separator"},
        {role: "cut"},
        {role: "copy"},
        {role: "paste"},
        {role: "pasteAndMatchStyle"},
        {role: "delete"},
        {role: "selectAll"},
        {type: "separator"},
        {
          label: "Speech",
          submenu: [{role: "startSpeaking"}, {role: "stopSpeaking"}],
        },
      ],
    },
    {
      label: "Window",
      submenu: [{role: "minimize"}, {role: "zoom"}, {role: "togglefullscreen"}, {role: "front"}],
    },
  ]
}

function createWindowsMenu(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  const tasksMenu = createTasksMenu(mainWindow)

  return [
    {
      label: "File",
      submenu: [{role: "quit"}],
    },
    {
      label: "Tasks",
      submenu: tasksMenu,
    },
    {
      label: "Edit",
      submenu: [{role: "undo"}, {role: "redo"}, {type: "separator"}, {role: "cut"}, {role: "copy"}, {role: "paste"}, {role: "selectAll"}],
    },
    {
      label: "View",
      submenu: [
        {role: "reload"},
        {role: "forceReload"},
        ...(ENV.isDevelopment ? [{role: "toggleDevTools" as const}] : []),
        {type: "separator"},
        {role: "resetZoom"},
        {role: "zoomIn"},
        {role: "zoomOut"},
        {type: "separator"},
        {role: "togglefullscreen"},
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Daily",
          click: () => ipcMain.emit("about:open"),
        },
      ],
    },
  ]
}

function createTasksMenu(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  return [
    {
      label: ShortcutsMap["tasks:create"].label,
      accelerator: ShortcutsMap["tasks:create"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["tasks:create"].channel),
    },
    {type: "separator"},
    {
      label: ShortcutsMap["ui:toggle-sidebar"].label,
      accelerator: ShortcutsMap["ui:toggle-sidebar"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:toggle-sidebar"].channel),
    },
    {
      label: ShortcutsMap["ui:toggle-tasks-view-mode"].label,
      accelerator: ShortcutsMap["ui:toggle-tasks-view-mode"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:toggle-tasks-view-mode"].channel),
    },
    {type: "separator"},
    ...(ENV.isDevelopment ? [{role: "toggleDevTools" as const}] : []),
  ]
}
