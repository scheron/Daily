// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useProjectScopeStore} from "../../../src/renderer/src/stores/projectScope.store"
import {useSettingsStore} from "../../../src/renderer/src/stores/settings.store"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {useUIStore} from "../../../src/renderer/src/stores/ui"
import {makeTask} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({
  toRawDeep: (v) => v,
}))

describe("projectScopeStore", () => {
  let bridge

  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function setup(isAllProjects) {
    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 0))
    settingsStore.settings = {branch: {activeId: "main", isAllProjects}, layout: {sectionsCollapsed: {}}}
    const tasks = useTasksStore()
    tasks.tasks = [makeTask("main-task"), makeTask("other-task", {branchId: "other"})]
    return tasks
  }

  it("shows the tasks of every project when the flag is on and the board is on the Days frame", async () => {
    const tasks = await setup(true)

    expect(useProjectScopeStore().isAllProjectsMode).toBe(true)
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["main-task", "other-task"])
    expect(tasks.days[0].tasks.map((task) => task.id).sort()).toEqual(["main-task", "other-task"])
  })

  it("falls back to the active project on the milestone frame and returns on Days", async () => {
    const tasks = await setup(true)
    const ui = useUIStore()

    ui.setFrame("milestone")
    expect(useProjectScopeStore().isAllProjectsMode).toBe(false)
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["main-task"])

    ui.setFrame("day")
    expect(useProjectScopeStore().isAllProjectsMode).toBe(true)
  })

  it("keeps the active project when the flag is off", async () => {
    const tasks = await setup(false)

    expect(useProjectScopeStore().isAllProjectsMode).toBe(false)
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["main-task"])
  })

  it("setAllProjects saves the flag beside activeId and writes it through at once", async () => {
    await setup(false)

    await useProjectScopeStore().setAllProjects(true)

    expect(useSettingsStore().settings.branch).toEqual({activeId: "main", isAllProjects: true})
    expect(bridge["settings:save"]).toHaveBeenCalledWith({branch: {activeId: "main", isAllProjects: true}})
  })
})
