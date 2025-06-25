import {app, dialog} from "electron"

import type {BrowserWindow, MenuItemConstructorOptions} from "electron"

export function createWindowsMenu(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
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
        ...(process.env.NODE_ENV === "development" ? [{role: "toggleDevTools" as const}] : []),
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
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About Daily",
              message: "Daily",
              detail: `Version: ${app.getVersion()}\nElevate Your Productivity with Daily\n\nCopyright © 2025 Infected by js`,
              buttons: ["OK"],
            })
          },
        },
      ],
    },
  ]
}
