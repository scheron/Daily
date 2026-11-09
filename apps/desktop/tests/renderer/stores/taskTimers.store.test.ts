// @vitest-environment happy-dom
import {nextTick} from "vue"
import {createPinia, disposePinia} from "pinia"
import {expect, it, vi} from "vitest"

import {useTaskTimersStore} from "@/stores/task-timers"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

import type {TaskTimer, TaskTimerCommand} from "@shared/types/taskTimer"

it("keeps a newer broadcast when loading finishes with an older timer list", async () => {
  const pinia = createPinia()
  const initial = Promise.withResolvers<TaskTimer[]>()
  const subscribe = vi.fn<(callback: (timers: TaskTimer[]) => void) => () => void>().mockReturnValue(vi.fn())
  mockBridgeIPC({
    "task-timers:get": () => initial.promise,
    "task-timers:on-changed": subscribe,
  })

  try {
    const store = useTaskTimersStore(pinia)
    const [[broadcast]] = subscribe.mock.calls
    broadcast([{taskId: "task-a", elapsedMs: 2000, isRunning: false}])
    initial.resolve([])
    await nextTick()

    expect(store.timers.map((timer) => timer.taskId)).toEqual(["task-a"])
  } finally {
    disposePinia(pinia)
  }
})

it("projects elapsed time from receipt of the snapshot despite a wall-clock jump", async () => {
  const pinia = createPinia()
  const running = {taskId: "task-a", elapsedMs: 2_000, isRunning: true}
  vi.useFakeTimers({toFake: ["Date", "performance", "setInterval", "clearInterval"]})
  mockBridgeIPC({"task-timers:get": vi.fn().mockResolvedValue([running])})

  try {
    const store = useTaskTimersStore(pinia)
    await nextTick()
    await nextTick()
    vi.setSystemTime(Date.now() + 3_600_000)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(store.elapsedSeconds(store.timers[0])).toBe(3)
  } finally {
    disposePinia(pinia)
    vi.useRealTimers()
  }
})

it("allows promotion while a Pause write is pending", async () => {
  const pinia = createPinia()
  const pause = Promise.withResolvers<boolean>()
  const dispatch = vi.fn((command: TaskTimerCommand) => (command.type === "pause" ? pause.promise : Promise.resolve(true)))
  mockBridgeIPC({"task-timers:dispatch": dispatch})

  try {
    const store = useTaskTimersStore(pinia)
    const paused = store.dispatch({type: "pause", taskId: "task-a"})
    expect(await store.dispatch({type: "promote", taskId: "task-a"})).toBe(true)
    expect(store.isPending("task-a")).toBe(true)
    expect(dispatch.mock.calls.map(([command]) => command.type)).toEqual(["pause", "promote"])

    pause.resolve(true)
    await paused
    expect(store.isPending("task-a")).toBe(false)
  } finally {
    disposePinia(pinia)
  }
})
