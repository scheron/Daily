import {app, ipcMain, Menu} from "electron"

import {ENV} from "@shared/config/env"
import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"

import {updaterController} from "@/updates/UpdaterController"

import type {BrowserWindow, MenuItemConstructorOptions} from "electron"

export function setupMenu(getMainWindow: () => BrowserWindow | null) {
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
      submenu: createTasksMenu(mainWindow),
    },
    {
      label: "Settings",
      submenu: createSettingsMenu(),
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
      label: SHORTCUTS_MAP["tasks:create"].label,
      accelerator: SHORTCUTS_MAP["tasks:create"].accelerator,
      click: () => mainWindow.webContents.send(SHORTCUTS_MAP["tasks:create"].channel),
    },
    {type: "separator"},
    {
      label: SHORTCUTS_MAP["ui:open-search-panel"].label,
      accelerator: SHORTCUTS_MAP["ui:open-search-panel"].accelerator,
      click: () => mainWindow.webContents.send(SHORTCUTS_MAP["ui:open-search-panel"].channel),
    },
    {
      label: SHORTCUTS_MAP["ui:open-settings-panel"].label,
      accelerator: SHORTCUTS_MAP["ui:open-settings-panel"].accelerator,
      click: () => ipcMain.emit("settings:open"),
    },
    {
      label: SHORTCUTS_MAP["ui:open-assistant-panel"].label,
      accelerator: SHORTCUTS_MAP["ui:open-assistant-panel"].accelerator,
      click: () => ipcMain.emit("assistant:open"),
    },
    {type: "separator"},
    {
      label: SHORTCUTS_MAP["ui:left-panel:toggle"].label,
      accelerator: SHORTCUTS_MAP["ui:left-panel:toggle"].accelerator,
      click: () => mainWindow.webContents.send(SHORTCUTS_MAP["ui:left-panel:toggle"].channel),
    },

    {type: "separator"},
    ...(ENV.isDevelopment ? [{role: "toggleDevTools" as const}] : []),
  ]
}

function createSettingsMenu(): MenuItemConstructorOptions[] {
  const sections = [
    "settings:general",
    "settings:workflow",
    "settings:icloud",
    "settings:ai",
    ...(ENV.isDevelopment ? (["settings:debug"] as const) : []),
  ] as const

  return sections.map((key) => {
    const shortcut = SHORTCUTS_MAP[key]
    return {
      label: shortcut.label,
      accelerator: shortcut.accelerator,
      click: () => ipcMain.emit("settings:open", {}, shortcut.section),
    }
  })
}
