// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {QUICK_TASK_FORWARDED_CHANNELS} from "../../../../../src/shared/constants/quickTask"
import {createStorageRequestHandler} from "../../../../../src/main/modules/quickTask/utils/createStorageRequestHandler"

vi.mock("@daily/core", () => ({toSettingsView: (settings) => ({view: settings})}))

describe("Daily's answers to the Quick task process", () => {
  const storage = {
    loadSettings: vi.fn(async () => ({a: 1})),
    getAllTasks: vi.fn(async () => ["task"]),
    createTask: vi.fn(async (task) => ({created: task})),
    getBranchList: vi.fn(async () => ["branch"]),
    getTagList: vi.fn(async () => ["tag"]),
    getMilestoneList: vi.fn(async (branchId) => [`milestone of ${branchId}`]),
    saveSettings: vi.fn(),
    deleteTask: vi.fn(),
  }
  const handle = createStorageRequestHandler(() => storage)

  it("whitelists exactly the data channels the panel uses", () => {
    expect([...QUICK_TASK_FORWARDED_CHANNELS].sort()).toEqual([
      "branches:get-many",
      "milestones:get-many",
      "settings:load",
      "tags:get-many",
      "tasks:create",
      "tasks:get-all",
    ])
  })

  it("runs the storage call behind each whitelisted channel", async () => {
    expect(await handle("settings:load", [])).toEqual({view: {a: 1}})
    expect(await handle("tasks:get-all", [])).toEqual(["task"])
    expect(await handle("tasks:create", [{content: "x"}])).toEqual({created: {content: "x"}})
    expect(await handle("branches:get-many", [])).toEqual(["branch"])
    expect(await handle("tags:get-many", [])).toEqual(["tag"])
    expect(await handle("milestones:get-many", ["main"])).toEqual(["milestone of main"])
  })

  it.each(["settings:save", "tasks:delete", "files:save", "ai:send", "nope"])("rejects %s", async (channel) => {
    await expect(handle(channel, [])).rejects.toThrow("not allowed")
    expect(storage.saveSettings).not.toHaveBeenCalled()
    expect(storage.deleteTask).not.toHaveBeenCalled()
  })

  it("answers nothing while storage is not ready", async () => {
    const early = createStorageRequestHandler(() => null)

    expect(await early("tasks:get-all", [])).toBeUndefined()
  })
})
