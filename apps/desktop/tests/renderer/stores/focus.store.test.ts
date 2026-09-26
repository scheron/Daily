// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useFocusStore} from "../../../src/renderer/src/stores/focus.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

function makeTask(overrides = {}) {
  return {taskId: "t1", title: "Write the report", focusedSeconds: 0, isDone: false, ...overrides}
}

function makeSession(overrides = {}) {
  return {
    phase: "collect",
    mode: "pomodoro-25",
    tasks: [],
    currentTaskId: null,
    runStartedAt: null,
    intervalFocusedSeconds: 0,
    completedIntervals: 0,
    isDetached: false,
    ...overrides,
  }
}

describe("focusStore", () => {
  let bridge
  let onChanged

  beforeEach(() => {
    onChanged = null
    bridge = mockBridgeIPC({
      "focus:get": vi.fn().mockResolvedValue(makeSession()),
      "focus:dispatch": vi.fn(),
      "focus:on-changed": vi.fn((callback) => {
        onChanged = callback
      }),
    })
    setActivePinia(createPinia())
  })

  it("takes the session main broadcasts", async () => {
    const store = useFocusStore()
    await vi.waitFor(() => expect(store.session).not.toBeNull())

    const next = makeSession({phase: "focus", tasks: [makeTask()], currentTaskId: "t1", runStartedAt: "2026-09-26T10:00:00.000Z"})
    onChanged(next)

    expect(store.session).toEqual(next)
  })

  it("keeps a broadcast that lands while the first load is still in flight", async () => {
    let resolveLoad
    bridge["focus:get"].mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)))
    const store = useFocusStore()

    onChanged(makeSession({mode: "timer"}))
    resolveLoad(makeSession())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(store.session.mode).toBe("timer")
  })

  it("sends a command to main and takes the session it returns", async () => {
    const store = useFocusStore()
    bridge["focus:dispatch"].mockResolvedValue(makeSession({mode: "pomodoro-50"}))

    await store.dispatch({type: "set-mode", mode: "pomodoro-50"})

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "set-mode", mode: "pomodoro-50"})
    expect(store.session.mode).toBe("pomodoro-50")
  })

  it("counts a task in the session only while it is not done and the session is not at its summary", () => {
    const store = useFocusStore()

    onChanged(makeSession({phase: "focus", tasks: [makeTask({taskId: "t1"}), makeTask({taskId: "t2", isDone: true})], currentTaskId: "t1"}))
    expect([store.isInSession("t1"), store.isInSession("t2"), store.isInSession("t9")]).toEqual([true, false, false])

    onChanged(makeSession({phase: "summary", tasks: [makeTask({taskId: "t1"})]}))
    expect(store.isInSession("t1")).toBe(false)
  })
})
