// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTasksStore} from "@renderer/stores/tasks.store"
import ContinuousCalendar from "@renderer/ui/views/Main/{fragments}/Footer/ContinuousCalendar.vue"
import {DAYS_PER_CHUNK} from "@renderer/ui/views/Main/{fragments}/Footer/lattice"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))
vi.mock("@renderer/utils/perf", () => ({perfMark: vi.fn(), perfMeasure: vi.fn()}))
vi.mock("@renderer/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
  },
}))

describe("ContinuousCalendar", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountCalendar(days = []) {
    API.getDays.mockResolvedValueOnce(days)
    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    const wrapper = mount(ContinuousCalendar, {props: {activeDay: TODAY, dropTargetDate: null}})
    return {store, wrapper}
  }

  it("renders every loaded date exactly once, including today", async () => {
    const {wrapper} = await mountCalendar()
    const cells = wrapper.findAll("[data-drop-day]")

    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length % DAYS_PER_CHUNK).toBe(0)

    const dates = cells.map((cell) => cell.attributes("data-drop-day"))
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates).toContain(TODAY)
  })

  it("selects a day on click", async () => {
    const {store, wrapper} = await mountCalendar()
    const target = DateTime.now().plus({days: 1}).toISODate()

    await wrapper.find(`[data-drop-day="${target}"]`).trigger("click")

    expect(store.activeDay).toBe(target)
  })

  it("shows a warning dot for days with active tasks and a success dot for completed days", async () => {
    const activeDay = {date: TODAY, tasks: [{id: "t1", status: "active", tags: []}], tags: [], countActive: 1, countDone: 0}
    const doneDate = DateTime.now().plus({days: 2}).toISODate()
    const doneDay = {date: doneDate, tasks: [{id: "t2", status: "done", tags: []}], tags: [], countActive: 0, countDone: 1}

    const {wrapper} = await mountCalendar([activeDay, doneDay])

    expect(wrapper.find(`[data-drop-day="${TODAY}"] .bg-warning`).exists()).toBe(true)
    expect(wrapper.find(`[data-drop-day="${doneDate}"] .bg-success`).exists()).toBe(true)
  })
})
