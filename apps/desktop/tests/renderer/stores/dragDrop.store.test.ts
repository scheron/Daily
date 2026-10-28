// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useDragDropStore} from "../../../src/renderer/src/stores/dragDrop.store"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeTask} from "../../helpers/taskFixtures"

describe("day drop", () => {
  beforeEach(() => {
    mockBridgeIPC({"tasks:update": vi.fn().mockResolvedValue({})})
    setActivePinia(createPinia())
  })

  it("assigns the selected day to undated Ready rather than treating it as already there", () => {
    const tasks = useTasksStore()
    tasks.activeDay = "2030-01-02"
    tasks.tasks = [makeTask({id: "ready", status: "ready_for_agent", scheduled: null})]
    useDragDropStore().dropOnDay("ready", "2030-01-02")
    expect(tasks.findTaskById("ready")).toMatchObject({status: "ready_for_agent", scheduled: {date: "2030-01-02"}})
  })

  it("skips a task already dated on the target day regardless of the selected board day", () => {
    const tasks = useTasksStore()
    tasks.activeDay = "2030-01-02"
    const ready = makeTask({id: "ready", status: "ready_for_agent", scheduled: {date: "2030-01-03", time: "09:00:00", timezone: "UTC"}})
    tasks.tasks = [ready]
    useDragDropStore().dropOnDay("ready", "2030-01-03")
    expect(tasks.findTaskById("ready")).toEqual(ready)
    expect(window.BridgeIPC["tasks:update"]).not.toHaveBeenCalled()
  })
})
