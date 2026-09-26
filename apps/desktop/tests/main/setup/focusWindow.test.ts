// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {setupFocusWindow} from "../../../src/main/setup/app/focusWindow"

const electron = vi.hoisted(() => ({windows: []}))

vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options) {
      this.options = options
      this.url = null
      this.handlers = new Map()
      this.isClosed = false
      this.webContents = {once: vi.fn()}
      electron.windows.push(this)
    }

    loadURL(url) {
      this.url = url
    }

    on(event, handler) {
      this.handlers.set(event, handler)
    }

    close() {
      if (this.isClosed) throw new Error("Object has been destroyed")
      this.isClosed = true
      this.handlers.get("closed")?.()
    }
  },
}))

vi.mock("@daily/core", () => ({ENV: {isDevelopment: false}}))

vi.mock("@main/runtime/electronPaths", () => ({
  electronPaths: {renderer: () => "http://localhost:8080/", preload: () => "/preload.js", icon: () => "/icon.png"},
}))

function makeSession(isDetached) {
  return {
    phase: "focus",
    mode: "pomodoro-25",
    tasks: [],
    currentTaskId: null,
    runStartedAt: null,
    intervalFocusedSeconds: 0,
    completedIntervals: 0,
    isDetached,
  }
}

function setup() {
  const slots = {focus: null}
  const focus = {dispatch: vi.fn()}
  const mainWindow = {getBounds: () => ({x: 100, y: 50, width: 1200, height: 800})}
  const follow = setupFocusWindow(
    () => focus,
    () => mainWindow,
    () => slots.focus,
    (window) => (slots.focus = window),
  )

  return {follow, focus, slots}
}

describe("the focus window follows the session", () => {
  beforeEach(() => {
    electron.windows = []
  })

  it("opens one always-on-top window at #/focus over the main window's bottom-right corner when the session detaches", () => {
    const {follow, slots} = setup()

    follow(makeSession(true))
    follow(makeSession(true))

    expect(electron.windows).toHaveLength(1)
    const [focusWindow] = electron.windows
    expect(slots.focus).toBe(focusWindow)
    expect(focusWindow.url).toBe("http://localhost:8080/#/focus")
    expect(focusWindow.options).toMatchObject({width: 340, height: 500, x: 944, y: 334, alwaysOnTop: true, resizable: false})
  })

  it("closes the window when the session attaches, and sends no command for that close", () => {
    const {follow, focus, slots} = setup()

    follow(makeSession(true))
    follow(makeSession(false))

    expect(electron.windows[0].isClosed).toBe(true)
    expect(slots.focus).toBeNull()
    expect(focus.dispatch).not.toHaveBeenCalled()
  })

  it("attaches the session once when the window is closed by hand", () => {
    const {follow, focus, slots} = setup()

    follow(makeSession(true))
    electron.windows[0].close()

    expect(slots.focus).toBeNull()

    follow(makeSession(false))

    expect(focus.dispatch).toHaveBeenCalledTimes(1)
    expect(focus.dispatch).toHaveBeenCalledWith({type: "attach"})
  })
})
