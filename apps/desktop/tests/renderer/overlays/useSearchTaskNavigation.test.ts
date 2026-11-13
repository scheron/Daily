import {createPinia, disposePinia, setActivePinia} from "pinia"
import {expect, it, vi} from "vitest"

import {useBranchesStore} from "@/stores/branches"
import {useSettingsStore} from "@/stores/settings"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useUiStore} from "@/stores/ui"
import {useSearchTaskNavigation} from "@/ui/overlays/SearchModal/composables/useSearchTaskNavigation"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeTask} from "../../helpers/taskFixtures"

const confirm = vi.hoisted(() => vi.fn())

vi.mock("@/ui/overlays/ConfirmUnsavedModal", () => ({
  useConfirmUnsavedModal: () => ({open: confirm}),
}))

it("confirms an unscheduled result before switching projects and opening it", async () => {
  mockBridgeIPC()
  const pinia = createPinia()
  setActivePinia(pinia)

  try {
    const switchProject = vi.spyOn(useBranchesStore(), "setActiveBranch").mockResolvedValue(true)
    const openTask = vi.spyOn(useTaskEditorStore(), "open").mockResolvedValue()
    const {prepareNavigation} = useSearchTaskNavigation()
    const task = makeTask({branchId: "other", scheduled: null})
    const result = {task, branch: null, score: 0}

    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await expect(prepareNavigation(result)).resolves.toBeNull()
    expect(switchProject).not.toHaveBeenCalled()
    expect(openTask).not.toHaveBeenCalled()

    await expect(prepareNavigation(result)).resolves.toBe("editor")
    expect(switchProject).toHaveBeenCalledWith(task.branchId)
    expect(openTask).toHaveBeenCalledWith(task.id)
    expect(switchProject).toHaveBeenCalledBefore(openTask)
  } finally {
    disposePinia(pinia)
  }
})

it("keeps the project set when the result's project is in it", async () => {
  mockBridgeIPC()
  const pinia = createPinia()
  setActivePinia(pinia)

  try {
    useSettingsStore().settings = {branch: {activeId: "b", isAllProjects: false, selectedIds: ["a", "b"]}}
    const switchProject = vi.spyOn(useBranchesStore(), "setActiveBranch").mockResolvedValue(true)
    vi.spyOn(useTaskEditorStore(), "open").mockResolvedValue()
    const {prepareNavigation} = useSearchTaskNavigation()

    await prepareNavigation({task: makeTask({branchId: "a", scheduled: null}), branch: null, score: 0})
    expect(switchProject).not.toHaveBeenCalled()
  } finally {
    disposePinia(pinia)
  }
})

it("makes the result's project active without collapsing the Day set when the board is on the Milestone frame", async () => {
  mockBridgeIPC()
  const pinia = createPinia()
  setActivePinia(pinia)

  try {
    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 0))
    settingsStore.settings = {branch: {activeId: "b", isAllProjects: false, selectedIds: ["a", "b"]}}
    useUiStore().setFrame("milestone")
    const switchProject = vi.spyOn(useBranchesStore(), "setActiveBranch").mockResolvedValue(true)
    vi.spyOn(useTaskEditorStore(), "open").mockResolvedValue()
    const {prepareNavigation} = useSearchTaskNavigation()

    confirm.mockResolvedValueOnce(true)
    await prepareNavigation({task: makeTask({branchId: "a", scheduled: null}), branch: null, score: 0})

    expect(switchProject).not.toHaveBeenCalled()
    expect(settingsStore.settings.branch).toEqual({activeId: "a", isAllProjects: false, selectedIds: ["b", "a"]})
  } finally {
    disposePinia(pinia)
  }
})
