import {app, ipcMain, Menu} from "electron"

import {ENV} from "@/config"
import {checkForUpdate} from "@/setup/updates/updater"

import type {BrowserWindow, MenuItemConstructorOptions} from "electron"

export function setupMenu(getMainWindow: () => BrowserWindow | null): void {
  let template: Electron.MenuItemConstructorOptions[]

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
      submenu: [
        {
          label: "New Task",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow.webContents.send("new-task"),
        },
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+I",
          click: () => mainWindow.webContents.send("toggle-sidebar"),
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
      ],
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
  return [
    {
      label: "File",
      submenu: [
        {
          label: "New Task",
          accelerator: "Ctrl+N",
          click: () => {
            mainWindow?.webContents.send("new-task")
          },
        },
        {type: "separator"},
        {role: "quit"},
      ],
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
