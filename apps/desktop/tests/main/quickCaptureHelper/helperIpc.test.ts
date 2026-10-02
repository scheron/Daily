// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {setupHelperIpc} from "../../../src/main/quickCaptureHelper/helperIpc"

const electron = vi.hoisted(() => ({handlers: new Map(), listeners: new Map()}))
const windows = vi.hoisted(() => ({hide: vi.fn(), resize: vi.fn(), place: vi.fn(), set: vi.fn()}))

vi.mock("electron", () => ({
  ipcMain: {
    on: (channel, listener) => electron.listeners.set(channel, listener),
    handle: (channel, handler) => electron.handlers.set(channel, handler),
  },
}))
vi.mock("@main/windows/quickCapture.window", () => ({hideQuickCapture: windows.hide, resizeQuickCapture: windows.resize}))
vi.mock("@main/windows/quickCaptureMenu.window", () => ({placeQuickCaptureMenu: windows.place, setQuickCaptureMenu: windows.set}))

const MENU = {
  rows: [
    {label: "Divider", icon: "minus"},
    {label: "work", color: "#f00", tone: "remove"},
  ],
  selected: 0,
  caretX: 10,
}

describe("the helper's IPC", () => {
  const panelContents = {send: vi.fn()}
  const panel = {isDestroyed: () => false, webContents: panelContents}
  const menuContents = {}
  const menu = {isDestroyed: () => false, webContents: menuContents}
  const own = {sender: panelContents}
  const fromMenu = {sender: menuContents}
  const foreign = {sender: {}}
  let forward = null

  beforeEach(() => {
    electron.handlers.clear()
    electron.listeners.clear()
    Object.values(windows).forEach((fn) => fn.mockClear())
    panelContents.send.mockClear()
    forward = vi.fn(async () => "answer")
    setupHelperIpc({getPanel: () => panel, getMenu: () => menu, forward})
  })

  const send = (channel, payload, event = own) => electron.listeners.get(channel)(event, payload)

  describe("forwarded channels", () => {
    it.each(["settings:load", "tasks:get-all", "tasks:create", "branches:get-many", "tags:get-many"])(
      "hands %s to Daily with its arguments and returns the answer",
      async (channel) => {
        expect(await electron.handlers.get(channel)(own, {a: 1})).toBe("answer")

        expect(forward).toHaveBeenCalledWith(channel, [{a: 1}])
      },
    )

    it("registers no other data channel", () => {
      expect([...electron.handlers.keys()].sort()).toEqual(["branches:get-many", "settings:load", "tags:get-many", "tasks:create", "tasks:get-all"])
    })

    it("refuses a caller that is not the panel", () => {
      expect(() => electron.handlers.get("tasks:create")(foreign, {})).toThrow("not available")

      expect(forward).not.toHaveBeenCalled()
    })

    it("lets the menu window load settings", () => {
      electron.handlers.get("settings:load")(fromMenu)

      expect(forward).toHaveBeenCalledWith("settings:load", [])
    })

    it.each(["tasks:get-all", "tasks:create", "branches:get-many", "tags:get-many"])("refuses %s from the menu window", (channel) => {
      expect(() => electron.handlers.get(channel)(fromMenu, {})).toThrow("not available")

      expect(forward).not.toHaveBeenCalled()
    })
  })

  describe("the window channels", () => {
    it("hides and resizes the panel for its own windows only", () => {
      send("quick-capture:hide")
      send("quick-capture:hide", undefined, foreign)
      send("quick-capture:resize", 200)
      send("quick-capture:resize", 200, foreign)
      send("quick-capture:hide", undefined, fromMenu)
      send("quick-capture:resize", 200, fromMenu)

      expect(windows.hide).toHaveBeenCalledTimes(1)
      expect(windows.resize).toHaveBeenCalledTimes(1)
      expect(windows.resize).toHaveBeenCalledWith(panel, 200)
    })

    it("forwards a well-formed menu, and null, to the menu window", () => {
      send("quick-capture:set-menu", MENU)
      send("quick-capture:set-menu", null)

      expect(windows.set).toHaveBeenNthCalledWith(1, menu, panel, MENU)
      expect(windows.set).toHaveBeenNthCalledWith(2, menu, panel, null)
    })

    it("takes the menu content from the panel only", () => {
      send("quick-capture:set-menu", MENU, fromMenu)
      send("quick-capture:set-menu", MENU, foreign)

      expect(windows.set).not.toHaveBeenCalled()
    })

    it.each([
      ["a string", "menu"],
      ["rows that are not an array", {...MENU, rows: "x"}],
      ["a row without a label", {...MENU, rows: [{icon: "minus"}]}],
      ["a caret that is not finite", {...MENU, caretX: "10"}],
      ["a caret that is NaN", {...MENU, caretX: NaN}],
      ["a negative selection", {...MENU, selected: -1}],
      ["a fractional selection", {...MENU, selected: 0.5}],
      ["an unknown tone", {...MENU, rows: [{label: "a", tone: "add"}]}],
    ])("drops a menu with %s", (_name, payload) => {
      send("quick-capture:set-menu", payload)

      expect(windows.set).not.toHaveBeenCalled()
    })

    it("places the menu window for a finite height from the menu window, and ignores anything else", () => {
      send("quick-capture-menu:resize", 120, fromMenu)
      send("quick-capture-menu:resize", 120, own)
      send("quick-capture-menu:resize", NaN, fromMenu)
      send("quick-capture-menu:resize", "120", fromMenu)

      expect(windows.place).toHaveBeenCalledTimes(1)
      expect(windows.place).toHaveBeenCalledWith(menu, panel, 120)
    })

    it("hands a picked index to the panel only when the menu window sends a non-negative integer", () => {
      send("quick-capture-menu:pick", 3, fromMenu)
      send("quick-capture-menu:pick", 3, own)
      send("quick-capture-menu:pick", -1, fromMenu)
      send("quick-capture-menu:pick", 1.5, fromMenu)
      send("quick-capture-menu:pick", "2", fromMenu)

      expect(panelContents.send).toHaveBeenCalledTimes(1)
      expect(panelContents.send).toHaveBeenCalledWith("quick-capture:menu-pick", 3)
    })
  })
})
