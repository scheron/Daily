// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {setupQuickTask} from "../../../src/main/setup/app/quickTask"

vi.mock("@daily/core", () => ({logger: {error: vi.fn(), CONTEXT: {APP: "APP"}}}))

function setup(isEnabled: boolean | undefined = true) {
  const quickTask = {start: vi.fn(), stop: vi.fn()}
  const storage = {loadSettings: vi.fn(async () => ({quickTask: {isEnabled}}))}
  return {quickTask, storage, ...setupQuickTask(quickTask, () => storage)}
}

describe("the Quick task process follows the Quick task switch", () => {
  it("starts the process while the switch is on", async () => {
    const {quickTask, apply} = setup(true)
    await apply()
    expect(quickTask.start).toHaveBeenCalledOnce()
    expect(quickTask.stop).not.toHaveBeenCalled()
  })

  it("stops the process once the switch turns off", async () => {
    const {quickTask, apply} = setup(false)
    await apply()
    expect(quickTask.stop).toHaveBeenCalledOnce()
    expect(quickTask.start).not.toHaveBeenCalled()
  })

  it("leaves the process as it is when the setting cannot be read", async () => {
    const {quickTask, storage, apply} = setup(true)
    storage.loadSettings.mockRejectedValue(new Error("db"))
    await apply()
    expect(quickTask.start).not.toHaveBeenCalled()
    expect(quickTask.stop).not.toHaveBeenCalled()
  })
})
