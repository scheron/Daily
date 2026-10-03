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
  const helper = {request: vi.fn().mockResolvedValue(undefined)}
  const storage = {loadSettings: vi.fn(async () => ({quickCapture: {hotkey}}))}
  const quickTask = setupTrayQuickTask(tray, helper, () => storage)
  return {item: () => items.get("quickTask"), helper, storage, ...quickTask}
}

describe("the tray's Quick task item", () => {
  it("starts disabled and passes the helper's availability on to the item", () => {
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

    storage.loadSettings.mockResolvedValue({quickCapture: {hotkey: "Control+Shift+K"}})
    await refreshAccelerator()
    expect(item().accelerator).toBe("Control+Shift+K")

    storage.loadSettings.mockResolvedValue({quickCapture: {hotkey: ""}})
    await refreshAccelerator()
    expect(item().accelerator).toBeUndefined()
  })

  it("asks the helper to open the panel when clicked", () => {
    const {item, helper} = setup()

    item().click()

    expect(helper.request).toHaveBeenCalledWith("panel:toggle")
  })
})
