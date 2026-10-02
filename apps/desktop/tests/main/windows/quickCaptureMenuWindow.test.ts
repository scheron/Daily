// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {createQuickCaptureMenuWindow, placeQuickCaptureMenu, setQuickCaptureMenu} from "../../../src/main/windows/quickCaptureMenu.window"

const created = vi.hoisted(() => ({options: null, win: null}))

vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options) {
      created.options = options
      created.win = this
      this.on = vi.fn()
      this.setAlwaysOnTop = vi.fn()
      this.setVisibleOnAllWorkspaces = vi.fn()
      this.loadURL = vi.fn()
      this.webContents = {on: vi.fn((_channel, listener) => (this.onIpc = listener)), send: vi.fn()}
    }
  },
  screen: {
    getDisplayNearestPoint: () => ({workArea: {x: 0, y: 25, width: 1920, height: 1055}}),
  },
}))
vi.mock("@daily/core", () => ({ENV: {isDevelopment: false}}))
vi.mock("@main/runtime/electronPaths", () => ({electronPaths: {renderer: () => "http://x/", preload: () => "/p.js"}}))

const MENU = {rows: [{label: "Divider", icon: "minus"}], selected: 0, caretX: 100}

describe("the Quick Capture menu window", () => {
  let panel = null
  let menu = null

  beforeEach(() => {
    const listeners = {}
    panel = {
      bounds: {x: 600, y: 700, width: 640, height: 120},
      visible: true,
      isDestroyed: () => false,
      isVisible: () => panel.visible,
      getBounds: () => panel.bounds,
      on: vi.fn((event, listener) => (listeners[event] = listener)),
      off: vi.fn(),
      emit: (event) => listeners[event](),
    }
    menu = createQuickCaptureMenuWindow(panel)
    Object.assign(menu, {
      visible: false,
      isDestroyed: () => false,
      isVisible: () => menu.visible,
      setBounds: vi.fn((bounds) => (menu.bounds = bounds)),
      showInactive: vi.fn(() => (menu.visible = true)),
      hide: vi.fn(() => (menu.visible = false)),
      setOpacity: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
    })
    menu.onIpc({}, "window:ready")
  })

  it("never takes focus, is frameless and transparent only for its corners, and floats above the panel over full-screen apps", () => {
    expect(created.options).toMatchObject({focusable: false, frame: false, transparent: true, show: false})
    expect(created.win.setAlwaysOnTop).toHaveBeenCalledWith(true, "pop-up-menu")
    expect(created.win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {visibleOnFullScreen: true, skipTransformProcessType: true})
  })

  it("sends the menu to its renderer and waits for the height before showing", () => {
    setQuickCaptureMenu(menu, panel, MENU)

    expect(menu.webContents.send).toHaveBeenCalledWith("quick-capture-menu:menu", MENU)
    expect(menu.showInactive).not.toHaveBeenCalled()
  })

  it("holds a menu that arrives before its renderer is ready and sends it on ready", () => {
    const early = createQuickCaptureMenuWindow(panel)
    Object.assign(early, {isDestroyed: () => false, isVisible: () => false})

    setQuickCaptureMenu(early, panel, MENU)
    expect(early.webContents.send).not.toHaveBeenCalled()

    early.onIpc({}, "window:ready")
    expect(early.webContents.send).toHaveBeenCalledWith("quick-capture-menu:menu", MENU)
  })

  it("sits just above the panel's top edge with its left edge at the caret, and shows without focus", () => {
    setQuickCaptureMenu(menu, panel, MENU)

    placeQuickCaptureMenu(menu, panel, 200)

    expect(menu.bounds).toEqual({x: 700, y: 700 - 4 - 200, width: 240, height: 200})
    expect(menu.showInactive).toHaveBeenCalledTimes(1)
  })

  it("stays inside the work area horizontally and never reaches above its top", () => {
    panel.bounds = {x: 1500, y: 100, width: 640, height: 120}
    setQuickCaptureMenu(menu, panel, {...MENU, caretX: 600})

    placeQuickCaptureMenu(menu, panel, 400)

    expect(menu.bounds.x).toBe(1920 - 240)
    expect(menu.bounds.y).toBeGreaterThanOrEqual(25)
    expect(menu.bounds.y + menu.bounds.height).toBe(96)
  })

  it("goes invisible and mouse-transparent when the menu closes, and ignores a height that arrives after", () => {
    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)

    setQuickCaptureMenu(menu, panel, null)
    expect(menu.setOpacity).toHaveBeenLastCalledWith(0)
    expect(menu.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)

    menu.setOpacity.mockClear()
    menu.setBounds.mockClear()
    placeQuickCaptureMenu(menu, panel, 100)
    expect(menu.setOpacity).not.toHaveBeenCalled()
    expect(menu.setBounds).not.toHaveBeenCalled()
  })

  it("shows the new rows before restoring opacity and mouse events on reopen, without ordering in again", () => {
    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)
    setQuickCaptureMenu(menu, panel, null)
    menu.showInactive.mockClear()
    menu.webContents.send.mockClear()
    menu.setOpacity.mockClear()

    setQuickCaptureMenu(menu, panel, MENU)
    expect(menu.webContents.send).toHaveBeenCalledWith("quick-capture-menu:menu", MENU)
    expect(menu.setOpacity).not.toHaveBeenCalled()

    placeQuickCaptureMenu(menu, panel, 100)
    expect(menu.setOpacity).toHaveBeenLastCalledWith(1)
    expect(menu.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
    expect(menu.showInactive).not.toHaveBeenCalled()
  })

  it("never orders the menu window out while the panel stays visible, because the third such hide makes macOS blur the panel and close it", () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      setQuickCaptureMenu(menu, panel, MENU)
      placeQuickCaptureMenu(menu, panel, 100)
      setQuickCaptureMenu(menu, panel, null)
    }

    expect(panel.visible).toBe(true)
    expect(menu.hide).not.toHaveBeenCalled()
  })

  it("hides with the panel", () => {
    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)

    panel.visible = false
    panel.emit("hide")

    expect(menu.hide).toHaveBeenCalled()
    expect(menu.webContents.send).toHaveBeenLastCalledWith("quick-capture-menu:menu", null)
  })

  it("does not place the window for a caret that is not a finite number", () => {
    setQuickCaptureMenu(menu, panel, {...MENU, caretX: NaN})

    placeQuickCaptureMenu(menu, panel, 100)

    expect(menu.setBounds).not.toHaveBeenCalled()
    expect(menu.showInactive).not.toHaveBeenCalled()
  })

  it("follows the panel when its height changes while the menu is open", () => {
    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)
    expect(menu.bounds.y + menu.bounds.height).toBe(696)

    panel.bounds = {x: 600, y: 650, width: 640, height: 170}
    panel.emit("resize")

    expect(menu.bounds).toEqual({x: 700, y: 646 - 100, width: 240, height: 100})
  })

  it("does not follow a panel resize when no menu is open", () => {
    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)
    setQuickCaptureMenu(menu, panel, null)
    menu.setBounds.mockClear()

    panel.emit("resize")

    expect(menu.setBounds).not.toHaveBeenCalled()
  })

  it("does not open for a menu while the panel is hidden", () => {
    panel.visible = false

    setQuickCaptureMenu(menu, panel, MENU)
    placeQuickCaptureMenu(menu, panel, 100)

    expect(menu.showInactive).not.toHaveBeenCalled()
  })
})
