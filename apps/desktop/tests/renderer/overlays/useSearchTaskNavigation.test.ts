import {createPinia, disposePinia, setActivePinia} from "pinia"
import {expect, it, vi} from "vitest"

import {useBranchesStore} from "@/stores/branches"
import {useTaskEditorStore} from "@/stores/task-editor"
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
