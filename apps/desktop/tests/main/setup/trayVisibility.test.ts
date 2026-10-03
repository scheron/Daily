// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {setupTrayVisibility} from "../../../src/main/setup/app/trayVisibility"

vi.mock("@daily/core", () => ({logger: {error: vi.fn(), CONTEXT: {APP: "APP"}}}))

function setup(isVisible: boolean | undefined = true) {
  const tray = {create: vi.fn(), destroy: vi.fn(), isVisible: false}
  const storage = {loadSettings: vi.fn(async () => ({menuBar: {isVisible}}))}
  const visibility = setupTrayVisibility(tray, () => storage)
  return {tray, storage, ...visibility}
}

describe("the tray follows the Show icon in menu bar setting", () => {
  it("creates the icon at startup when the setting is on", async () => {
    const {tray, apply} = setup(true)
    await apply()
    expect(tray.create).toHaveBeenCalledOnce()
    expect(tray.destroy).not.toHaveBeenCalled()
  })

  it("never creates the icon at startup when the setting is off", async () => {
    const {tray, apply} = setup(false)
    await apply()
    expect(tray.create).not.toHaveBeenCalled()
  })

  it("removes the icon when the setting turns off and brings it back when it turns on", async () => {
    const {tray, storage, apply} = setup(true)
    await apply()

    storage.loadSettings.mockResolvedValue({menuBar: {isVisible: false}})
    await apply()
    expect(tray.destroy).toHaveBeenCalledOnce()

    storage.loadSettings.mockResolvedValue({menuBar: {isVisible: true}})
    await apply()
    expect(tray.create).toHaveBeenCalledTimes(2)
  })

  it("leaves the icon as it is when the setting cannot be read", async () => {
    const {tray, storage, apply} = setup(true)
    storage.loadSettings.mockRejectedValue(new Error("db"))

    tray.isVisible = false
    await apply()
    expect(tray.create).not.toHaveBeenCalled()

    tray.destroy.mockClear()
    tray.isVisible = true
    await apply()
    expect(tray.destroy).not.toHaveBeenCalled()
  })
})
