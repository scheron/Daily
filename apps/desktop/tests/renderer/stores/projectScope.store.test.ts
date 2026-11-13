// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useBranchesStore} from "../../../src/renderer/src/stores/branches"
import {useProjectScopeStore} from "../../../src/renderer/src/stores/project-scope"
import {useSettingsStore} from "../../../src/renderer/src/stores/settings"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {useUiStore} from "../../../src/renderer/src/stores/ui"
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

  async function setup(isAllProjects, selectedIds = ["main"], activeId = selectedIds[selectedIds.length - 1]) {
    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 0))
    settingsStore.settings = {branch: {activeId, isAllProjects, selectedIds}, layout: {sectionsCollapsed: {}}}
    useBranchesStore().branches = ["main", "other", "third"].map((id) => ({id, name: id}))
    const tasks = useTasksStore()
    tasks.tasks = [makeTask("main-task"), makeTask("other-task", {branchId: "other"}), makeTask("third-task", {branchId: "third"})]
    return tasks
  }

  function branchOf() {
    return useSettingsStore().settings.branch
  }

  it("shows the tasks of every project when the flag is on and the board is on the Days frame", async () => {
    const tasks = await setup(true)

    expect(useProjectScopeStore().isAllProjectsMode).toBe(true)
    expect(useProjectScopeStore().isMultiProjectMode).toBe(true)
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["main-task", "other-task", "third-task"])
  })

  it("falls back to the active project on the milestone frame and returns on Days [project-menu#milestone-one-project]", async () => {
    const tasks = await setup(true, ["main", "other"])
    const ui = useUiStore()

    ui.setFrame("milestone")
    expect(useProjectScopeStore().isAllProjectsMode).toBe(false)
    expect(useProjectScopeStore().isMultiProjectMode).toBe(false)
    expect(useProjectScopeStore().projectIdsInScope).toEqual(["other"])
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["other-task"])

    ui.setFrame("day")
    expect(useProjectScopeStore().isAllProjectsMode).toBe(true)
  })

  it("filters the tasks by the selected set [project-menu#several-as-all]", async () => {
    const tasks = await setup(false, ["main", "third"])

    expect(useProjectScopeStore().isAllProjectsMode).toBe(false)
    expect(useProjectScopeStore().isMultiProjectMode).toBe(true)
    expect(useProjectScopeStore().projectIdsInScope).toEqual(["main", "third"])
    expect(tasks.projectTasks.map((task) => task.id)).toEqual(["main-task", "third-task"])
  })

  it("selectProject makes a set of one, makes it active, and writes it through at once", async () => {
    await setup(false, ["main", "other"])

    await useProjectScopeStore().selectProject("third")

    expect(branchOf()).toEqual({activeId: "third", isAllProjects: false, selectedIds: ["third"]})
    expect(bridge["settings:save"]).toHaveBeenCalledWith({branch: {activeId: "third", isAllProjects: false, selectedIds: ["third"]}})
  })

  it("toggleProject adds in order, makes the added project active, and removes without emptying the set [project-menu#cmd-multi-select]", async () => {
    await setup(false, ["main"])
    const scope = useProjectScopeStore()

    await scope.toggleProject("other")
    expect(branchOf()).toEqual({activeId: "other", isAllProjects: false, selectedIds: ["main", "other"]})

    await scope.toggleProject("other")
    expect(branchOf()).toEqual({activeId: "main", isAllProjects: false, selectedIds: ["main"]})

    await scope.toggleProject("main")
    expect(branchOf().selectedIds).toEqual(["main"])
  })

  it("toggleProject turns a set of every project into the All projects flag [project-menu#all-is-every-project]", async () => {
    await setup(false, ["main", "other"])

    await useProjectScopeStore().toggleProject("third")

    expect(branchOf()).toEqual({activeId: "third", isAllProjects: true, selectedIds: ["main", "other", "third"]})
  })

  it("toggleProject from All projects leaves every project but the clicked one, keeping the active project [project-menu#all-is-every-project]", async () => {
    await setup(true, ["main", "other", "third"], "other")

    await useProjectScopeStore().toggleProject("main")

    expect(branchOf()).toEqual({activeId: "other", isAllProjects: false, selectedIds: ["third", "other"]})
  })

  it("toggleProject from All projects on the active project hands activeId to the last of the rest [project-menu#all-is-every-project]", async () => {
    await setup(true, ["main", "other", "third"], "other")

    await useProjectScopeStore().toggleProject("other")

    expect(branchOf()).toEqual({activeId: "third", isAllProjects: false, selectedIds: ["main", "third"]})
  })

  it("selectAllProjects saves the flag and keeps the set", async () => {
    await setup(false, ["main", "other"])

    await useProjectScopeStore().selectAllProjects()

    expect(branchOf()).toEqual({activeId: "other", isAllProjects: true, selectedIds: ["main", "other"]})
  })
})
