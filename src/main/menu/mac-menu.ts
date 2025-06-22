import {app, dialog} from "electron"

import type {BrowserWindow, MenuItemConstructorOptions} from "electron"
import {checkForUpdate} from "../services/updater.js"

export function createMacMenu(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  return [
    {
      label: app.name,
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
        ...(process.env.NODE_ENV === "development" ? [{role: "toggleDevTools" as const}] : []),
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
