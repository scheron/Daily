// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {setupTrayQuickTask} from "../../../src/main/setup/app/trayQuickTask"

vi.mock("@daily/core", () => ({logger: {error: vi.fn(), CONTEXT: {APP: "APP"}}}))

function setup(hotkey = "Command+Alt+Space") {
  const items = new Map()
  const tray = {
    addItem: (item) => items.set(item.id, item),
    updateItem: (id, patch) => items.set(id, {...items.get(id), ...patch}),
  }
  const quickTaskProcess = {request: vi.fn().mockResolvedValue(undefined)}
  const storage = {loadSettings: vi.fn(async () => ({quickTask: {hotkey}}))}
  const trayItem = setupTrayQuickTask(tray, quickTaskProcess, () => storage)
  return {item: () => items.get("quickTask"), quickTaskProcess, storage, ...trayItem}
}

describe("the tray's Quick task item", () => {
  it("starts disabled and passes the Quick task process's availability on to the item", () => {
    const {item, setAvailable} = setup()
    expect(item()).toMatchObject({label: "Quick task", enabled: false})

    setAvailable(true)
    expect(item().enabled).toBe(true)
    setAvailable(false)
    expect(item().enabled).toBe(false)
  })

  it("shows the saved shortcut as its accelerator, follows a change, and shows none when it is cleared", async () => {
    const {item, storage, refreshAccelerator} = setup()
    await refreshAccelerator()
    expect(item()).toMatchObject({label: "Quick task", accelerator: "Command+Alt+Space"})

    storage.loadSettings.mockResolvedValue({quickTask: {hotkey: "Control+Shift+K"}})
    await refreshAccelerator()
    expect(item().accelerator).toBe("Control+Shift+K")

    storage.loadSettings.mockResolvedValue({quickTask: {hotkey: ""}})
    await refreshAccelerator()
    expect(item().accelerator).toBeUndefined()
  })

  it("asks the Quick task process to open the panel when clicked", () => {
    const {item, quickTaskProcess} = setup()

    item().click()

    expect(quickTaskProcess.request).toHaveBeenCalledWith("panel:toggle")
  })
})
