// @vitest-environment happy-dom
import {createPinia, disposePinia, setActivePinia} from "pinia"
import {expect, it, vi} from "vitest"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useOpenTimerTask} from "@/ui/modules/TaskBoard/{fragments}/TaskTimerStack/composables/useOpenTimerTask"
import {mockBridgeIPC} from "../../../../../helpers/bridgeIPC"
import {makeTask} from "../../../../../helpers/taskFixtures"

const confirmLeave = vi.hoisted(() => vi.fn<() => Promise<boolean>>())

vi.mock("@/ui/overlays/ConfirmUnsavedModal", () => ({
  useConfirmUnsavedModal: () => ({open: confirmLeave}),
}))

it("opens and promotes the timer task only after confirming the switch", async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const task = makeTask({id: "timer-task"})
  const getTask = vi.fn().mockResolvedValue(task)
  let editingWhenPromoted: string | null = null
  const dispatch = vi.fn(() => {
    editingWhenPromoted = useTaskEditorStore().editingTaskId
    return Promise.resolve(true)
  })
  mockBridgeIPC({"tasks:get-one": getTask, "task-timers:dispatch": dispatch})
  confirmLeave.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

  try {
    const {openTimerTask} = useOpenTimerTask()
    await openTimerTask(task.id)
    expect(getTask).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()

    await openTimerTask(task.id)
    expect(getTask).toHaveBeenCalledExactlyOnceWith(task.id)
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({type: "promote", taskId: task.id})
    expect(editingWhenPromoted).toBe(task.id)
  } finally {
    disposePinia(pinia)
  }
})
