import type {BrowserWindow} from "electron"

export function handleDeepLink(url: string, mainWindow: BrowserWindow): void {
  console.log("Deep link received:", url)
  mainWindow.webContents.send("deep-link", url)
}
