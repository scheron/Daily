import {EventEmitter} from "node:events"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {createToastRouter} from "../../../src/main/setup/ipc/toast"

import type {ToastMessage} from "@shared/types/toast"
import type {BrowserWindow} from "electron"

const electron = vi.hoisted(() => ({ipcMain: new Map(), fromWebContents: vi.fn()}))

vi.mock("electron", () => ({
  BrowserWindow: {fromWebContents: electron.fromWebContents},
  ipcMain: {on: (channel: string, handler: (...args: unknown[]) => void) => electron.ipcMain.set(channel, handler)},
}))

function makeWindow() {
  const state = {destroyed: false, visible: false, minimized: false}
  const contents = Object.assign(new EventEmitter(), {
    ipc: new EventEmitter(),
    isDestroyed: () => state.destroyed,
    mainFrame: {},
    send: vi.fn(),
  })
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isMinimized: () => state.minimized,
    isVisible: () => state.visible,
    webContents: contents,
  })

  return {
    window: window as unknown as BrowserWindow,
    contents,
    signalReady: (senderFrame = contents.mainFrame) => contents.ipc.emit("toast:renderer-ready", {sender: contents, senderFrame}),
    show: () => {
      state.visible = true
      window.emit("show")
    },
    minimize: () => {
      state.minimized = true
      window.emit("minimize")
    },
    restore: () => {
      state.minimized = false
      window.emit("restore")
    },
    close: () => {
      state.destroyed = true
      window.emit("closed")
    },
  }
}

const response: ToastMessage = {type: "success", message: "AI response ready"}
const failure: ToastMessage = {type: "error", message: "Failed to create task"}

describe("toast IPC", () => {
  beforeEach(() => {
    electron.ipcMain.clear()
    electron.fromWebContents.mockReset()
  })

  it("shows a queued toast once the main window is ready and visible", () => {
    const router = createToastRouter()
    router.publish(response)

    const main = makeWindow()
    router.trackMainWindow(main.window)
    main.signalReady()
    expect(main.contents.send).not.toHaveBeenCalled()

    main.show()
    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", response)

    main.signalReady()
    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", response)
  })

  it("routes valid requests from an application window to the main window only", () => {
    const router = createToastRouter()
    router.registerIPC()
    const publish = electron.ipcMain.get("toast:publish")
    const main = makeWindow()
    const settings = makeWindow()
    electron.fromWebContents.mockImplementation((contents) => (contents === settings.contents ? settings.window : null))

    router.trackMainWindow(main.window)
    main.show()
    main.signalReady()

    publish({sender: settings.contents, senderFrame: {}}, failure)
    publish({sender: main.contents, senderFrame: main.contents.mainFrame}, failure)
    publish({sender: settings.contents, senderFrame: settings.contents.mainFrame}, {type: "unsupported", message: "Not a toast"})
    expect(main.contents.send).not.toHaveBeenCalled()

    publish({sender: settings.contents, senderFrame: settings.contents.mainFrame}, failure)
    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", failure)
    expect(settings.contents.send).not.toHaveBeenCalled()
  })

  it("delivers queued toasts in order when the main window is restored", () => {
    const router = createToastRouter()
    const main = makeWindow()
    router.trackMainWindow(main.window)
    main.show()
    main.signalReady()
    main.minimize()

    router.publish(response)
    router.publish(failure)
    expect(main.contents.send).not.toHaveBeenCalled()

    main.restore()
    expect(main.contents.send.mock.calls).toEqual([
      ["toast:show", response],
      ["toast:show", failure],
    ])
  })

  it("waits for the replacement window's own top frame to be ready", () => {
    const router = createToastRouter()
    const previous = makeWindow()
    router.trackMainWindow(previous.window)
    previous.show()
    previous.signalReady()
    previous.close()

    router.publish(response)
    const main = makeWindow()
    router.trackMainWindow(main.window)
    main.show()
    previous.signalReady()
    main.signalReady({})
    expect(main.contents.send).not.toHaveBeenCalled()

    main.signalReady()
    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", response)
    expect(previous.contents.send).not.toHaveBeenCalled()
  })

  it("pauses delivery across renderer reloads and crashes", () => {
    const router = createToastRouter()
    const main = makeWindow()
    router.trackMainWindow(main.window)
    main.show()
    main.signalReady()

    main.contents.emit("did-start-navigation", {isMainFrame: true, isSameDocument: true})
    router.publish(response)
    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", response)

    main.contents.emit("did-start-navigation", {isMainFrame: true, isSameDocument: false})
    router.publish(failure)
    expect(main.contents.send).toHaveBeenCalledTimes(1)
    main.signalReady()
    expect(main.contents.send).toHaveBeenLastCalledWith("toast:show", failure)

    main.contents.emit("render-process-gone")
    router.publish(response)
    expect(main.contents.send).toHaveBeenCalledTimes(2)
    main.signalReady()
    expect(main.contents.send).toHaveBeenCalledTimes(3)
    expect(main.contents.send).toHaveBeenLastCalledWith("toast:show", response)
  })

  it("keeps a toast if the renderer disappears before IPC can send it", () => {
    const router = createToastRouter()
    const previous = makeWindow()
    router.trackMainWindow(previous.window)
    previous.show()
    previous.signalReady()
    previous.contents.send.mockImplementationOnce(() => {
      throw new Error("Render frame was disposed")
    })

    expect(() => router.publish(response)).not.toThrow()
    previous.close()
    const main = makeWindow()
    router.trackMainWindow(main.window)
    main.show()
    main.signalReady()

    expect(main.contents.send).toHaveBeenCalledExactlyOnceWith("toast:show", response)
  })
})
