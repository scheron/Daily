// @vitest-environment happy-dom
// @ts-nocheck
import {ref} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeTask} from "../../helpers/taskFixtures"

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

describe("useTaskModel — Normal column ordering", () => {
  beforeEach(() => {
    mockBridgeIPC({"tasks:move-by-order": vi.fn().mockResolvedValue({})})
    setActivePinia(createPinia())
  })

  async function setup() {
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    const {useTasksStore} = await import("../../../src/renderer/src/stores/tasks")
    const {useFilterStore} = await import("../../../src/renderer/src/stores/filter.store")
    const {useTaskModel} = await import("../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/useTaskModel")
    const settings = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve))
    settings.settings = {branch: {activeId: "main"}, appearance: {boardMode: "normal"}}
    const tasks = useTasksStore()
    tasks.activeDay = "2030-01-02"
    tasks.tasks = [
      makeTask({id: "first", status: "backlog", scheduled: null, orderIndex: 100}),
      makeTask({id: "ready", status: "ready_for_agent", scheduled: null, orderIndex: 200}),
      makeTask({id: "tomorrow", status: "ready_for_agent", scheduled: {date: "2030-01-03", time: "09:00:00", timezone: "UTC"}, orderIndex: 50}),
    ]
    const model = useTaskModel(ref(tasks.tasks[1]))
    return {tasks, model, filter: useFilterStore()}
  }

  it("moves Ready among visible Backlog neighbours without assigning a canonical status or day", async () => {
    const {model, tasks} = await setup()
    expect(model.canMoveUp.value).toBe(true)
    await model.moveUp()
    expect(tasks.dailyTasksByStatus.ready_for_agent.map((task) => task.id)).toEqual(["ready"])
    expect(tasks.findTaskById("ready")).toMatchObject({status: "ready_for_agent", scheduled: null})
    expect(tasks.findTaskById("ready").orderIndex).toBeLessThan(tasks.findTaskById("first").orderIndex)
    expect(tasks.findTaskById("tomorrow").orderIndex).toBe(50)
  })

  it("schedules an undated Ready task on the selected board day when explicitly starting it", async () => {
    const {model, tasks} = await setup()
    await model.changeStatus("in_progress")
    expect(tasks.findTaskById("ready")).toMatchObject({status: "in_progress", scheduled: {date: "2030-01-02"}})
    expect(tasks.dailyTasksByStatus.in_progress.map((task) => task.id)).toEqual(["ready"])
  })

  it("disables manual move actions in the chronological milestone frame", async () => {
    const {model, filter} = await setup()
    expect(model.canMoveUp.value).toBe(true)
    filter.setFrame("milestone")
    expect(model.canMoveUp.value).toBe(false)
    expect(model.canMoveDown.value).toBe(false)
  })
})
