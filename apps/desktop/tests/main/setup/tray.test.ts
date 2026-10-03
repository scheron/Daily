import {beforeEach, describe, expect, it, vi} from "vitest"

import {TrayController} from "../../../src/main/setup/app/tray"

const state = vi.hoisted(() => ({
  menus: [] as any[][],
  trays: [] as any[],
  emitted: [] as any[],
  quit: vi.fn(),
  checkForUpdate: vi.fn(),
  logged: vi.fn(),
  emptyIcon: false,
}))

vi.mock("electron", () => ({
  app: {name: "Daily", getVersion: () => "0.29.0", quit: state.quit},
  ipcMain: {emit: (...args: any[]) => state.emitted.push(args)},
  Menu: {
    buildFromTemplate: (template: any[]) => {
      state.menus.push(template)
      return template
    },
  },
  nativeImage: {createFromPath: () => ({setTemplateImage: vi.fn(), isEmpty: () => state.emptyIcon})},
  Tray: class {
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    destroy = vi.fn()
    constructor() {
      state.trays.push(this)
    }
  },
}))
vi.mock("@daily/core", () => ({logger: {error: state.logged, CONTEXT: {APP: "APP"}}}))
vi.mock("@main/runtime/electronPaths", () => ({electronPaths: {trayIcon: () => "/tray.png"}}))
vi.mock("@main/updates/UpdaterController", () => ({updaterController: {checkForUpdate: state.checkForUpdate}}))

const lastMenu = () => state.menus.at(-1)!

describe("TrayController", () => {
  beforeEach(() => {
    state.menus.length = 0
    state.trays.length = 0
    state.emitted.length = 0
    vi.clearAllMocks()
  })

  it("builds the menu with a disabled version row and the three actions", () => {
    const tray = new TrayController()
    tray.create()

    expect(lastMenu().map((i) => (i.type === "separator" ? "-" : [i.label, i.enabled]))).toEqual([
      ["Daily v0.29.0", false],
      "-",
      ["Settings…", true],
      ["Check for Updates…", true],
      "-",
      ["Quit", true],
    ])

    const click = (label: string) =>
      lastMenu()
        .find((i) => i.label === label)
        .click()
    click("Settings…")
    click("Check for Updates…")
    click("Quit")
    expect(state.emitted).toEqual([["settings:open"]])
    expect(state.checkForUpdate).toHaveBeenCalledWith({manual: true})
    expect(state.quit).toHaveBeenCalled()
  })

  it("shows Quit's shortcut natively without registering it", () => {
    const tray = new TrayController()
    tray.create()

    expect(lastMenu().find((i) => i.label === "Quit")).toMatchObject({accelerator: "CmdOrCtrl+Q", registerAccelerator: false})
    expect(lastMenu().find((i) => i.label === "Settings…")).not.toHaveProperty("accelerator")
  })

  it("adds an item above the one named and refreshes its accelerator and enabled state", () => {
    const tray = new TrayController()
    tray.create()
    tray.addItem({id: "quick", label: "Quick task", enabled: false}, "settings")
    expect(lastMenu().map((i) => i.label ?? "-")).toEqual(["Daily v0.29.0", "-", "Quick task", "-", "Settings…", "Check for Updates…", "-", "Quit"])
    expect(lastMenu()[2]).not.toHaveProperty("accelerator")

    tray.updateItem("quick", {accelerator: "Command+Alt+Space", enabled: true})
    expect(lastMenu()[2]).toMatchObject({label: "Quick task", accelerator: "Command+Alt+Space", registerAccelerator: false, enabled: true})

    tray.updateItem("quick", {accelerator: undefined})
    expect(lastMenu()[2]).not.toHaveProperty("accelerator")
  })

  it("logs a missing icon instead of failing silently", () => {
    state.emptyIcon = true
    new TrayController().create()
    state.emptyIcon = false

    expect(state.logged).toHaveBeenCalledWith("APP", expect.stringContaining("/tray.png"))
  })

  it("creates once, destroys, and recreates with its items kept", () => {
    const tray = new TrayController()
    tray.create()
    tray.create()
    expect(state.trays).toHaveLength(1)

    tray.addItem({id: "quick", label: "Quick task"}, "settings")
    tray.destroy()
    expect(state.trays[0].destroy).toHaveBeenCalled()
    expect(tray.isVisible).toBe(false)

    tray.updateItem("quick", {enabled: false})
    tray.create()
    expect(state.trays).toHaveLength(2)
    expect(lastMenu().map((i) => (i.type === "separator" ? "-" : [i.label, i.enabled]))).toEqual([
      ["Daily v0.29.0", false],
      "-",
      ["Quick task", false],
      "-",
      ["Settings…", true],
      ["Check for Updates…", true],
      "-",
      ["Quit", true],
    ])
  })
})
