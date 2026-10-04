// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {setupTrayOpenDaily} from "../../../src/main/setup/app/trayOpenDaily"

const appFocus = vi.hoisted(() => vi.fn())

vi.mock("electron", () => ({app: {focus: appFocus}}))

function makeWindow({minimized = false, destroyed = false} = {}) {
  return {isMinimized: () => minimized, isDestroyed: () => destroyed, restore: vi.fn(), focus: vi.fn()}
}

function setup(mainWindow) {
  const items = []
  const tray = {addItem: (item, beforeId) => items.push({item, beforeId})}
  const createMainWindow = vi.fn()
  setupTrayOpenDaily(tray, () => mainWindow, createMainWindow)
  return {added: items[0], click: () => items[0].item.click(), createMainWindow}
}

describe("the tray's Open Daily item", () => {
  it("sits above Settings… in the section Quick task shares", () => {
    const {added} = setup(null)

    expect(added).toMatchObject({item: {label: "Open Daily", section: "open"}, beforeId: "settings"})
  })

  it("brings Daily to the front and focuses the open main window, restoring it when minimized", () => {
    const mainWindow = makeWindow({minimized: true})
    const {click, createMainWindow} = setup(mainWindow)

    click()

    expect(appFocus).toHaveBeenCalledWith({steal: true})
    expect(mainWindow.restore).toHaveBeenCalled()
    expect(mainWindow.focus).toHaveBeenCalled()
    expect(createMainWindow).not.toHaveBeenCalled()
  })

  it.each([
    ["no main window", null],
    ["a destroyed one", makeWindow({destroyed: true})],
  ])("opens a new main window when there is %s", (_case, mainWindow) => {
    const {click, createMainWindow} = setup(mainWindow)

    click()

    expect(createMainWindow).toHaveBeenCalledTimes(1)
  })
})
