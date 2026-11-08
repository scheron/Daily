import {expect, it, vi} from "vitest"

import {createSettingsWindow} from "../../../src/main/windows/settings.window"

import type {BrowserWindowConstructorOptions} from "electron"

vi.mock("electron", async () => {
  const {EventEmitter} = await import("node:events")

  return {
    BrowserWindow: class {
      readonly webContents = Object.assign(new EventEmitter(), {
        ipc: new EventEmitter(),
        mainFrame: {},
      })

      private _visible: boolean

      constructor({show = true}: BrowserWindowConstructorOptions) {
        this._visible = show
      }

      loadFile() {}

      isMinimized() {
        return false
      }

      isVisible() {
        return this._visible
      }

      show() {
        this._visible = true
      }

      focus() {}
    },
  }
})
vi.mock("@daily/core", () => ({ENV: {isDevelopment: false}}))
vi.mock("@main/config/electronPaths", () => ({
  electronPaths: {icon: () => "/icon.png", renderer: () => "/index.html", preload: () => "/preload.cjs"},
}))

it("shows Settings when its renderer is ready even if an unrelated IPC message arrives first", () => {
  const settingsWindow = createSettingsWindow("general")
  const {webContents} = settingsWindow
  const show = vi.spyOn(settingsWindow, "show")

  sendRendererMessage("toast:renderer-ready")
  expect(settingsWindow.isVisible()).toBe(false)

  sendRendererMessage("window:ready")
  expect(settingsWindow.isVisible()).toBe(true)

  sendRendererMessage("window:ready")
  expect(show).toHaveBeenCalledTimes(1)

  function sendRendererMessage(channel: string) {
    const event = {sender: webContents, senderFrame: webContents.mainFrame}
    webContents.emit("ipc-message", event, channel)
    webContents.ipc.emit(channel, event)
  }
})
