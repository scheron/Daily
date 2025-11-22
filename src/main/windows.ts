import {BrowserWindow, shell} from "electron"

import type {Task} from "./types.js"

import {APP_CONFIG, PATHS} from "./config.js"

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: APP_CONFIG.name,
    width: APP_CONFIG.window.main.width,
    minWidth: APP_CONFIG.window.main.minWidth,
    height: APP_CONFIG.window.main.height,
    minHeight: APP_CONFIG.window.main.minHeight,
    center: true,
    transparent: true,
    frame: false,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: PATHS.icon,
    webPreferences: {
      preload: PATHS.preload,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  if (typeof PATHS.renderer === "string" && PATHS.renderer.startsWith("http")) {
    mainWindow.loadURL(PATHS.renderer)
  } else {
    mainWindow.loadFile(PATHS.renderer)
  }

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url)
    return {action: "deny"}
  })

  return mainWindow
}

export function createSplashWindow(): BrowserWindow {
  const splashWindow = new BrowserWindow({
    width: APP_CONFIG.window.splash.width,
    height: APP_CONFIG.window.splash.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    resizable: APP_CONFIG.window.splash.resizable,
    movable: false,
    hasShadow: false,
    webPreferences: {
      devTools: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const splashHTML = `
<!doctype html>
<html lang="en">
  <head>
    <style>
      :root {
        --primary-color: #4dcfa3;
        --primary-color-light: rgba(77, 207, 163, 0.44);
        --secondary-color: #ffffff;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --primary-color: #4dcfa3;
          --primary-color-light: rgba(77, 207, 163, 0.7);
          --secondary-color: #000000;
        }
      }

      html,
      body {
        margin: 0;
        padding: 0;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: var(--secondary-color);
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        font-family: sans-serif;
      }

      .particles {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
      }
      .particle {
        position: absolute;
        bottom: -20px;
        width: 8px;
        height: 8px;
        background: var(--primary-color-light);
        border-radius: 50%;
        opacity: 0;
        animation-name: floatUp;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      @keyframes floatUp {
        0% { transform: translateY(0) scale(1); opacity: 0; }
        10% { opacity: 1; } 
        50% { opacity: 0.6; transform: translateY(-50vh) scale(1.2); }
        100% { transform: translateY(-100vh) scale(1.4); opacity: 0; }
      }

      .particle:nth-child(1) { left: 5%; animation-duration: 4s; animation-delay: 0s; }
      .particle:nth-child(2) { left: 15%; animation-duration: 3.25s; animation-delay: 0.5s; }
      .particle:nth-child(3) { left: 25%; animation-duration: 3.6s; animation-delay: 1s; }
      .particle:nth-child(4) { left: 35%; animation-duration: 4.5s; animation-delay: 0.25s; }
      .particle:nth-child(5) { left: 45%; animation-duration: 2.75s; animation-delay: 0.75s; }
      .particle:nth-child(6) { left: 55%; animation-duration: 4.15s; animation-delay: 0.1s; }
      .particle:nth-child(7) { left: 65%; animation-duration: 3.4s; animation-delay: 0.6s; }
      .particle:nth-child(8) { left: 75%; animation-duration: 3.75s; animation-delay: 1.15s; }
      .particle:nth-child(9) { left: 85%; animation-duration: 4.35s; animation-delay: 0.4s; }
      .particle:nth-child(10) { left: 10%; animation-duration: 3.95s; animation-delay: 0.9s; }
      .particle:nth-child(11) { left: 20%; animation-duration: 3.1s; animation-delay: 0.2s; }
      .particle:nth-child(12) { left: 30%; animation-duration: 4.65s; animation-delay: 1s; }
      .particle:nth-child(13) { left: 50%; animation-duration: 2.9s; animation-delay: 0.55s; }
      .particle:nth-child(14) { left: 70%; animation-duration: 4s; animation-delay: 0.3s; }
      .particle:nth-child(15) { left: 90%; animation-duration: 3.45s; animation-delay: 0.7s; }

      .logo-wrapper {
        position: relative;
        width: 120px;
        height: 120px;
        z-index: 1;
        pointer-events: none;
      }
      .logo {
        width: 100%;
        height: 100%;
        display: block;
        fill: var(--primary-color);
        filter: drop-shadow(0 0 12px var(--primary-color-light));
        transform-origin: center;
        animation: pulse 3s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
    </style>
  </head>

  <body>
    <div class="particles">
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
      <div class="particle"></div>
    </div>

    <div class="logo-wrapper">
      <svg class="logo" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M240.001 0C273.138 0 300.001 26.8629 300.001 60V240.001C300.001 273.138 273.138 300.001 240.001 300.001H60C26.8629 300.001 0 273.138 0 240.001V60C2.96392e-05 26.8629 26.8629 0 60 0H240.001ZM76.0566 64.7891V95.9717H89.7764V205.616H76.0566V236.685H142.048C149.908 236.684 157.449 235.664 164.668 233.623C171.887 231.582 178.615 228.691 184.851 224.949C191.086 221.207 196.755 216.709 201.857 211.456C206.96 206.203 211.325 200.382 214.953 193.995C218.581 187.608 221.378 180.747 223.344 173.415C225.309 166.083 226.292 158.448 226.292 150.511C226.292 142.574 225.309 134.938 223.344 127.605C221.379 120.273 218.582 113.433 214.953 107.083C211.325 100.733 206.959 94.9692 201.857 89.791C196.756 84.6129 191.087 80.1717 184.851 76.4678C178.614 72.7639 171.887 69.8915 164.668 67.8506C157.449 65.8096 149.908 64.7891 142.047 64.7891H76.0566ZM141.82 95.9766C147.943 95.9763 153.725 97.3748 159.168 100.172C164.61 102.969 169.335 106.824 173.341 111.737C177.347 116.65 180.522 122.432 182.865 129.084C185.209 135.736 186.38 142.88 186.38 150.515C186.38 158.225 185.209 165.425 182.865 172.115C180.522 178.805 177.347 184.625 173.341 189.576C169.335 194.527 164.61 198.439 159.168 201.312C153.725 204.184 147.942 205.62 141.819 205.62H127.42V95.9756L141.82 95.9766Z"
        />
      </svg>
    </div>
  </body>
</html>
  `

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`)

  return splashWindow
}

export function createTimerWindow(taskId?: Task["id"]): BrowserWindow {
  const timerWindow = new BrowserWindow({
    title: "Daily Timer",
    show: false,
    icon: PATHS.icon,
    width: APP_CONFIG.window.timer.width,
    height: APP_CONFIG.window.timer.height,
    resizable: APP_CONFIG.window.timer.resizable,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    webPreferences: {
      devTools: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: PATHS.preload,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  const timerUrl = taskId ? `#/timer?taskId=${taskId}` : "#/timer"

  if (typeof PATHS.renderer === "string" && PATHS.renderer.startsWith("http")) {
    timerWindow.loadURL(`${PATHS.renderer}${timerUrl}`)
  } else {
    timerWindow.loadFile(PATHS.renderer, {hash: timerUrl})
  }

  timerWindow.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url)
    return {action: "deny"}
  })

  return timerWindow
}

export function createDevToolsWindow(): BrowserWindow {
  const devToolsWindow = new BrowserWindow({
    title: "Daily · DB Viewer",
    width: APP_CONFIG.window.devTools.width,
    minWidth: APP_CONFIG.window.devTools.minWidth,
    height: APP_CONFIG.window.devTools.height,
    minHeight: APP_CONFIG.window.devTools.minHeight,
    show: false,
    icon: PATHS.icon,
    frame: false,
    backgroundColor: "#1c1e2e",
    webPreferences: {
      devTools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: PATHS.preload,
      webSecurity: true,
    },
  })

  if (typeof PATHS.renderer === "string" && PATHS.renderer.startsWith("http")) {
    devToolsWindow.loadURL(`${PATHS.renderer}#/db-viewer`)
  } else {
    devToolsWindow.loadFile(PATHS.renderer, {hash: "/db-viewer"})
  }

  devToolsWindow.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url)
    return {action: "deny"}
  })

  devToolsWindow.once("ready-to-show", () => {
    devToolsWindow.show()
  })

  return devToolsWindow
}

export function focusWindow(win: BrowserWindow) {
  if (win.isMinimized()) win.restore()
  win.focus()
}
