import {join} from "node:path"
import {pathToFileURL} from "node:url"
import {app, BrowserWindow} from "electron"

import {APP_CONFIG} from "@shared/config/app"
import {focusWindow} from "@/utils/windows/focusWindow"
import {resolveAboutLogoURL} from "@/utils/windows/resolveAboutLogoDataURL"

import {electronPaths} from "@/runtime/electronPaths"

export function createAboutWindow(): BrowserWindow {
  const aboutWindow = new BrowserWindow({
    title: "About Daily",
    width: 250,
    height: 250,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    center: true,
    show: false,
    transparent: true,
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: electronPaths.icon(),
    webPreferences: {
      devTools: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const appName = APP_CONFIG.name
  const appVersion = app.getVersion()
  const appYear = new Date().getFullYear()
  const appAuthor = APP_CONFIG.author
  const iconDataURL = resolveAboutLogoURL()
  const fallbackIconURL = pathToFileURL(join(process.cwd(), "public", "icon.png")).toString()
  const iconURL = iconDataURL ?? fallbackIconURL

  const aboutHTML = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100vh;
        align-items:center;
        justify-content:center;
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
          Arial, sans-serif;
        background: radial-gradient(1200px 600px at 15% -20%, #1e2430 0%, #111419 48%, #0c0f13 100%);
        color: #f2f2f3;
      }

      .drag-zone {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2;
        height: 24px;
        -webkit-app-region: drag;
      }

      .window {
        flex:1;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100vh;
        align-items:center;
        justify-content:center;
      }

      .content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        user-select: none;
      }

      .logo-frame {
        width: 74px;
        height: 74px;
        border-radius: 18px;
        background: linear-gradient(180deg, #f3f4f6 0%, #dddfe5 100%);
        display: grid;
        place-items: center;
      }

      .logo {
        width: 74px;
        height: 74px;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
      }

      .title {
        margin: 2px 0 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1;
      }

      .meta {
        margin: 0;
        font-size: 12px;
        font-weight: 500;
        color: #d2d5db;
        letter-spacing: -0.01em;
      }

      .copyright {
        margin: 0;
        font-size: 12px;
        font-weight: 500;
        color: #d2d5db;
      }
    </style>
  </head>
  <body>
    <header class="drag-zone"></header>
    <div class="window">
      <main class="content">
        <div class="logo-frame">
          <img class="logo" src="${iconURL}" alt="${appName} logo" draggable="false" />
        </div>
        <h1 class="title">${appName}</h1>
        <p class="meta">Version ${appVersion}</p>
        <p class="copyright">© ${appYear} ${appAuthor}</p>
      </main>
    </div>
  </body>
</html>
  `

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutHTML)}`)

  aboutWindow.once("ready-to-show", () => {
    aboutWindow.show()
    focusWindow(aboutWindow)
  })

  return aboutWindow
}
