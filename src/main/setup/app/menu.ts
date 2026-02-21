import {app, ipcMain, Menu} from "electron"

import {ShortcutsMap} from "@shared/constants/shortcuts"

import {ENV} from "@/config"
import {checkForUpdate} from "@/setup/updates/updater"

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
          click: () => checkForUpdate(mainWindow, true),
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
        ...(ENV.isDevelopment
          ? [
              {role: "toggleDevTools" as const},
              {
                label: "DB Viewer",
                accelerator: "Ctrl+Shift+D",
                click: () => {
                  ipcMain.emit("devtools:open")
                },
              },
            ]
          : []),
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
      label: ShortcutsMap["ui:open-calendar-panel"].label,
      accelerator: ShortcutsMap["ui:open-calendar-panel"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:open-calendar-panel"].channel),
    },
    {
      label: ShortcutsMap["ui:open-tags-panel"].label,
      accelerator: ShortcutsMap["ui:open-tags-panel"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:open-tags-panel"].channel),
    },
    {
      label: ShortcutsMap["ui:open-search-panel"].label,
      accelerator: ShortcutsMap["ui:open-search-panel"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:open-search-panel"].channel),
    },
    {
      label: ShortcutsMap["ui:open-assistant-panel"].label,
      accelerator: ShortcutsMap["ui:open-assistant-panel"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:open-assistant-panel"].channel),
    },
    {
      label: ShortcutsMap["ui:open-settings-panel"].label,
      accelerator: ShortcutsMap["ui:open-settings-panel"].accelerator,
      click: () => mainWindow.webContents.send(ShortcutsMap["ui:open-settings-panel"].channel),
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
    ...(ENV.isDevelopment
      ? [
          {role: "toggleDevTools" as const},
          {
            label: "DB Viewer",
            accelerator: "CmdOrCtrl+Shift+D",
            click: () => {
              ipcMain.emit("devtools:open")
            },
          },
        ]
      : []),
  ]
}
