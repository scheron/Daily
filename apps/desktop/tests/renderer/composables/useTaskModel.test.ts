// @vitest-environment happy-dom
// @ts-nocheck
import {ref} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("useTaskModel — updateTaskPriority", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function setup(priority) {
    const {useTasksStore} = await import("../../../src/renderer/src/stores/tasks")
    const {useTaskModel} = await import("../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/useTaskModel")

    const updateTask = vi.spyOn(useTasksStore(), "updateTask").mockResolvedValue(true)
    const model = useTaskModel(ref({id: "task-1", branchId: "main", priority}))
    return {model, updateTask}
  }

  it("writes_nothing_when_the_picked_level_is_the_current_one", async () => {
    const {model, updateTask} = await setup("high")

    await model.updateTaskPriority("high")

    expect(updateTask).not.toHaveBeenCalled()
  })

  it("writes_the_picked_level_when_it_differs", async () => {
    const {model, updateTask} = await setup("high")

    await model.updateTaskPriority("urgent")

    expect(updateTask).toHaveBeenCalledWith("task-1", {priority: "urgent"})
  })
})
