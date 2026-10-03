// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {createQuickTaskWindow, hideQuickTask, resizeQuickTask, showQuickTask, toggleQuickTask} from "../../../src/main/windows/quickTask.window"

const created = vi.hoisted(() => ({options: null, win: null}))
const electron = vi.hoisted(() => ({hide: vi.fn()}))

vi.mock("electron", () => ({
  app: {hide: electron.hide},
  BrowserWindow: class {
    constructor(options) {
      created.options = options
      created.win = this
      this.setAlwaysOnTop = vi.fn()
      this.setVisibleOnAllWorkspaces = vi.fn()
      this.loadURL = vi.fn()
      this.on = vi.fn((event, listener) => event === "blur" && (this.blurListener = listener))
      this.webContents = {on: vi.fn((_channel, listener) => (this.onIpc = listener)), send: vi.fn(), focus: vi.fn()}
    }
  },
  screen: {
    getCursorScreenPoint: () => ({x: 2500, y: 300}),
    getDisplayNearestPoint: (point) =>
      point.x >= 1920 ? {workArea: {x: 1920, y: 0, width: 1600, height: 900}} : {workArea: {x: 0, y: 25, width: 1920, height: 1055}},
  },
}))
vi.mock("@daily/core", () => ({ENV: {isDevelopment: false}}))
vi.mock("@main/config/electronPaths", () => ({electronPaths: {renderer: () => "http://x/", preload: () => "/p.js"}}))

function fakeWindow(bounds, state = {}) {
  const win = createQuickTaskWindow()
  Object.assign(win, {
    bounds,
    visible: state.visible ?? false,
    isDestroyed: () => false,
    getBounds: () => win.bounds,
    setBounds: vi.fn((next) => (win.bounds = next)),
    isVisible: () => win.visible,
    show: vi.fn(),
    showInactive: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    setOpacity: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
  })
  if (state.ready ?? true) win.onIpc({}, "window:ready")
  return win
}

describe("the Quick task window", () => {
  let win = null

  beforeEach(() => {
    electron.hide.mockClear()
    win = fakeWindow({x: 0, y: 0, width: 640, height: 120})
  })

  it("is frameless and transparent only for its corners, with no native glass", () => {
    createQuickTaskWindow()

    expect(created.options).toMatchObject({frame: false, transparent: true})
    expect(created.options).not.toHaveProperty("vibrancy")
    expect(created.options).not.toHaveProperty("visualEffectState")
  })

  it("floats over full-screen apps without turning the app into a UI element", () => {
    createQuickTaskWindow()

    expect(created.win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {visibleOnFullScreen: true, skipTransformProcessType: true})
  })

  it("stays hidden until shown, and orders nothing in once its renderer is ready", () => {
    win = fakeWindow({x: 0, y: 0, width: 640, height: 120})

    expect(created.options).toMatchObject({show: false})
    expect(win.show).not.toHaveBeenCalled()
    expect(win.showInactive).not.toHaveBeenCalled()
    expect(win.setOpacity).not.toHaveBeenCalled()
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalled()
  })

  it("defers the first show until the renderer is ready, then shows once", () => {
    win = fakeWindow({x: 0, y: 0, width: 640, height: 120}, {ready: false})

    showQuickTask(win)
    expect(win.focus).not.toHaveBeenCalled()

    win.onIpc({}, "window:ready")
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith("quick-task:shown")
  })

  it("shows nothing when the renderer becomes ready and no show was requested", () => {
    win = fakeWindow({x: 0, y: 0, width: 640, height: 120}, {ready: false})

    win.onIpc({}, "window:ready")

    expect(win.show).not.toHaveBeenCalled()
  })

  it("shows at the bottom centre of the display under the cursor, takes the keyboard and tells the renderer", () => {
    showQuickTask(win)

    expect(win.bounds).toEqual({x: 1920 + (1600 - 560) / 2, y: 900 - 48 - 120, width: 560, height: 120})
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalled()
    expect(win.webContents.focus).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith("quick-task:shown")
  })

  it("hides the panel and the Quick task app, so macOS returns the keyboard to the previous app", () => {
    win.visible = true

    hideQuickTask(win)

    expect(win.hide).toHaveBeenCalledTimes(1)
    expect(electron.hide).toHaveBeenCalledTimes(1)
  })

  it("does nothing when it is hidden already", () => {
    win.visible = false

    hideQuickTask(win)

    expect(win.hide).not.toHaveBeenCalled()
    expect(electron.hide).not.toHaveBeenCalled()
  })

  it("hides when the window loses focus", () => {
    win.visible = true

    win.blurListener()

    expect(win.hide).toHaveBeenCalledTimes(1)
  })

  it("grows upward with the bottom edge fixed", () => {
    win = fakeWindow({x: 800, y: 700, width: 640, height: 120})

    resizeQuickTask(win, 300)

    expect(win.bounds).toEqual({x: 800, y: 520, width: 640, height: 300})
  })

  it("never grows past the top of the work area", () => {
    win = fakeWindow({x: 800, y: 700, width: 640, height: 120})

    resizeQuickTask(win, 5000)

    expect(win.bounds.y).toBeGreaterThanOrEqual(25)
    expect(win.bounds.y + win.bounds.height).toBe(820)
  })

  it("hides on the hotkey when it is visible, and shows otherwise", () => {
    win.visible = false
    toggleQuickTask(win)
    expect(win.show).toHaveBeenCalledTimes(1)

    win.visible = true
    toggleQuickTask(win)
    expect(win.hide).toHaveBeenCalledTimes(1)
  })
})
